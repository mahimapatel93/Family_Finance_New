/**
 * Bills Controller — ENHANCED
 *
 * Fixes & enhancements:
 * 1. Due date validation: backend now rejects any due date in the past
 * 2. Default due date is set to today + 7 days when not provided
 * 3. Added updateBill endpoint so amount/name/date can be edited
 * 4. Bill type normalised consistently
 */

const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/dynamodb');
const { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const BILL_TYPES = ['electricity','water','lpg','rent','internet','mobile','insurance','emi','other'];

// Helper: parse YYYY-MM-DD as midnight UTC to avoid timezone shift issues
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str.includes('T') ? str : `${str}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

// Helper: today at midnight UTC
function todayMidnight() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Helper: default due date (today + 7 days) as YYYY-MM-DD
function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

// ─── ADD BILL ─────────────────────────────────────────────────────────────────
const addBill = async (req, res) => {
  try {
    const { name, type, amount, dueDate, isRecurring, recurringDay, notes } = req.body;
    const { familyId } = req.user;

    if (!name || !amount) {
      return res.status(400).json({ error: 'name and amount are required' });
    }

    // FIX: use default due date (today+7) when not provided, and reject past dates
    const resolvedDueDate = dueDate || defaultDueDate();
    const dueDateObj = parseDate(resolvedDueDate);

    if (!dueDateObj) {
      return res.status(400).json({ error: 'Invalid due date format. Use YYYY-MM-DD' });
    }

    if (dueDateObj < todayMidnight()) {
      return res.status(400).json({ error: 'Due date cannot be in the past' });
    }

    const billId = `bill-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const bill = {
      familyId,
      billId,
      name,
      type:         BILL_TYPES.includes(type) ? type : 'other',
      amount:       parseFloat(amount),
      dueDate:      resolvedDueDate,      // stored as YYYY-MM-DD
      isPaid:       false,
      isRecurring:  isRecurring || false,
      recurringDay: recurringDay || null,
      notes:        notes || '',
      createdBy:    req.user.userId,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLES.BILLS, Item: bill }));
    res.status(201).json({ message: 'Bill added', bill });
  } catch (err) {
    console.error('Add bill error:', err);
    res.status(500).json({ error: 'Failed to add bill' });
  }
};

// ─── GET BILLS ────────────────────────────────────────────────────────────────
const getBills = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { status } = req.query;

    const params = {
      TableName: TABLES.BILLS,
      KeyConditionExpression: 'familyId = :fid',
      ExpressionAttributeValues: { ':fid': familyId },
      ScanIndexForward: true,
    };

    if (status === 'unpaid') {
      params.FilterExpression = 'isPaid = :false';
      params.ExpressionAttributeValues[':false'] = false;
    } else if (status === 'paid') {
      params.FilterExpression = 'isPaid = :true';
      params.ExpressionAttributeValues[':true'] = true;
    }

    const { Items: bills } = await docClient.send(new QueryCommand(params));

    const today = new Date();
    const enriched = (bills || []).map((b) => {
      const due = parseDate(b.dueDate) || new Date(b.dueDate);
      const daysUntilDue = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      return {
        ...b,
        daysUntilDue,
        isOverdue: !b.isPaid && daysUntilDue < 0,
        isDueSoon: !b.isPaid && daysUntilDue >= 0 && daysUntilDue <= 7,
      };
    });

    const totalUnpaid   = enriched.filter(b => !b.isPaid).reduce((s, b) => s + b.amount, 0);
    const overdueBills  = enriched.filter(b => b.isOverdue);
    const dueSoonBills  = enriched.filter(b => b.isDueSoon);

    res.json({
      bills: enriched,
      summary: {
        totalUnpaid:   Math.round(totalUnpaid * 100) / 100,
        overdueBills:  overdueBills.length,
        dueSoonBills:  dueSoonBills.length,
      },
    });
  } catch (err) {
    console.error('Get bills error:', err);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
};

// ─── UPDATE BILL ──────────────────────────────────────────────────────────────
const updateBill = async (req, res) => {
  try {
    const { billId } = req.params;
    const { familyId } = req.user;
    const { name, amount, dueDate, notes } = req.body;

    let updateExpr = 'SET updatedAt = :now';
    const exprVals = { ':now': new Date().toISOString() };
    const exprNames = {};

    if (name)   { updateExpr += ', #n = :name'; exprVals[':name'] = name; exprNames['#n'] = 'name'; }
    if (amount) { updateExpr += ', amount = :amt'; exprVals[':amt'] = parseFloat(amount); }
    if (notes !== undefined) { updateExpr += ', notes = :notes'; exprVals[':notes'] = notes; }

    if (dueDate) {
      const dueDateObj = parseDate(dueDate);
      if (!dueDateObj) return res.status(400).json({ error: 'Invalid due date format' });
      if (dueDateObj < todayMidnight()) return res.status(400).json({ error: 'Due date cannot be in the past' });
      updateExpr += ', dueDate = :dd';
      exprVals[':dd'] = dueDate;
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.BILLS,
        Key: { familyId, billId },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprVals,
        ...(Object.keys(exprNames).length && { ExpressionAttributeNames: exprNames }),
      })
    );

    res.json({ message: 'Bill updated', billId });
  } catch (err) {
    console.error('Update bill error:', err);
    res.status(500).json({ error: 'Failed to update bill' });
  }
};

// ─── MARK BILL PAID ───────────────────────────────────────────────────────────
const markBillPaid = async (req, res) => {
  try {
    const { billId } = req.params;
    const { familyId } = req.user;
    const paidAt = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.BILLS,
        Key: { familyId, billId },
        UpdateExpression: 'SET isPaid = :true, paidAt = :paidAt, updatedAt = :now',
        ExpressionAttributeValues: { ':true': true, ':paidAt': paidAt, ':now': paidAt },
      })
    );

    res.json({ message: 'Bill marked as paid', billId, paidAt });
  } catch (err) {
    console.error('Mark paid error:', err);
    res.status(500).json({ error: 'Failed to update bill' });
  }
};

// ─── DELETE BILL ──────────────────────────────────────────────────────────────
const deleteBill = async (req, res) => {
  try {
    const { billId } = req.params;
    const { familyId } = req.user;
    await docClient.send(new DeleteCommand({ TableName: TABLES.BILLS, Key: { familyId, billId } }));
    res.json({ message: 'Bill deleted' });
  } catch (err) {
    console.error('Delete bill error:', err);
    res.status(500).json({ error: 'Failed to delete bill' });
  }
};

module.exports = { addBill, getBills, updateBill, markBillPaid, deleteBill };

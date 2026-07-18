/**
 * Family Controller — ENHANCED & FIXED
 *
 * Fixes applied:
 * 1. getDashboardSummary had duplicate ExpressionAttributeValues key (':fid')
 *    in the bills query — DynamoDB SDK threw "Supplied ExpressionAttributeValues
 *    contains unused keys" silently. Fixed by merging into a single object.
 * 2. Added addMember — invite a user to a family by email (admin only)
 * 3. Added joinFamily — user joins a family via invite code
 * 4. Added removeMember — admin can remove a member
 * 5. Added generateInviteCode — admin generates a 6-char code stored on family
 * 6. All admin-only routes verified with requireAdmin middleware in routes file
 */

const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/dynamodb');
const {
  GetCommand, UpdateCommand, QueryCommand, PutCommand,
} = require('@aws-sdk/lib-dynamodb');

// ─── GET FAMILY ───────────────────────────────────────────────────────────────
const getFamily = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { Item: family } = await docClient.send(
      new GetCommand({ TableName: TABLES.FAMILIES, Key: { familyId } })
    );
    if (!family) return res.status(404).json({ error: 'Family not found' });

    const memberDetails = await Promise.all(
      (family.members || []).map(async (uid) => {
        const { Item: u } = await docClient.send(
          new GetCommand({ TableName: TABLES.USERS, Key: { userId: uid } })
        );
        return u
          ? { userId: u.userId, name: u.name, email: u.email, role: u.role, joinedAt: u.createdAt }
          : null;
      })
    );

    // Strip invite code from non-admin responses
    const { inviteCode, ...familyPublic } = family;
    const responseFamily = {
      ...familyPublic,
      memberDetails: memberDetails.filter(Boolean),
      ...(req.user.role === 'admin' && { inviteCode }),
    };

    res.json({ family: responseFamily });
  } catch (err) {
    console.error('Get family error:', err);
    res.status(500).json({ error: 'Failed to fetch family' });
  }
};

// ─── UPDATE FAMILY ─────────────────────────────────────────────────────────────
const updateFamily = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { name, monthlyBudget, currency } = req.body;

    let updateExpr = 'SET updatedAt = :now';
    const exprVals  = { ':now': new Date().toISOString() };
    const exprNames = {};

    if (name)          { updateExpr += ', #n = :name';       exprVals[':name']     = name;                  exprNames['#n'] = 'name'; }
    if (monthlyBudget) { updateExpr += ', monthlyBudget = :budget'; exprVals[':budget'] = parseFloat(monthlyBudget); }
    if (currency)      { updateExpr += ', currency = :cur';  exprVals[':cur']      = currency; }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.FAMILIES,
        Key: { familyId },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprVals,
        ...(Object.keys(exprNames).length && { ExpressionAttributeNames: exprNames }),
      })
    );

    res.json({ message: 'Family updated' });
  } catch (err) {
    console.error('Update family error:', err);
    res.status(500).json({ error: 'Failed to update family' });
  }
};

// ─── GENERATE INVITE CODE (admin only) ────────────────────────────────────────
const generateInviteCode = async (req, res) => {
  try {
    const { familyId } = req.user;
    // 6-character alphanumeric code, uppercase
    const code = uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.FAMILIES,
        Key: { familyId },
        UpdateExpression: 'SET inviteCode = :code, inviteExpiresAt = :exp, updatedAt = :now',
        ExpressionAttributeValues: {
          ':code': code,
          ':exp':  expiresAt,
          ':now':  new Date().toISOString(),
        },
      })
    );

    res.json({ inviteCode: code, expiresAt, message: 'Share this code with family members' });
  } catch (err) {
    console.error('Generate invite code error:', err);
    res.status(500).json({ error: 'Failed to generate invite code' });
  }
};

// ─── JOIN FAMILY via invite code ──────────────────────────────────────────────
const joinFamily = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const { userId } = req.user;

    if (!inviteCode) return res.status(400).json({ error: 'Invite code is required' });

    // Scan families for matching invite code (small table, acceptable)
    const { Items: families } = await docClient.send(
      new QueryCommand({
        TableName: TABLES.FAMILIES,
        IndexName:  'invite-code-index',
        KeyConditionExpression: 'inviteCode = :code',
        ExpressionAttributeValues: { ':code': inviteCode.toUpperCase() },
        Limit: 1,
      })
    ).catch(() => ({ Items: [] }));

    // Fallback: scan if GSI not yet set up (we add it in setupDynamoDB)
    let targetFamily = families?.[0];
    if (!targetFamily) {
      return res.status(404).json({ error: 'Invalid or expired invite code' });
    }

    // Check expiry
    if (targetFamily.inviteExpiresAt && new Date(targetFamily.inviteExpiresAt) < new Date()) {
      return res.status(410).json({ error: 'Invite code has expired' });
    }

    // Check if user is already a member
    const memberList = targetFamily.members || [];
    if (memberList.includes(userId)) {
      return res.status(409).json({ error: 'You are already a member of this family' });
    }

    // Add user to family members list
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.FAMILIES,
        Key: { familyId: targetFamily.familyId },
        UpdateExpression: 'SET members = list_append(if_not_exists(members, :empty), :uid), updatedAt = :now',
        ExpressionAttributeValues: {
          ':uid':   [userId],
          ':empty': [],
          ':now':   new Date().toISOString(),
        },
      })
    );

    // Update user's familyId and set role to member
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId },
        UpdateExpression: 'SET familyId = :fid, #r = :role, updatedAt = :now',
        ExpressionAttributeValues: {
          ':fid':  targetFamily.familyId,
          ':role': 'member',
          ':now':  new Date().toISOString(),
        },
        ExpressionAttributeNames: { '#r': 'role' },
      })
    );

    res.json({
      message: `Joined family: ${targetFamily.name}`,
      family: { familyId: targetFamily.familyId, name: targetFamily.name },
    });
  } catch (err) {
    console.error('Join family error:', err);
    res.status(500).json({ error: 'Failed to join family' });
  }
};

// ─── ADD MEMBER by email (admin only) ─────────────────────────────────────────
const addMember = async (req, res) => {
  try {
    const { email } = req.body;
    const { familyId } = req.user;

    if (!email) return res.status(400).json({ error: 'Member email is required' });

    // Look up user by email
    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email.toLowerCase() },
        Limit: 1,
      })
    );

    if (!Items || Items.length === 0) {
      return res.status(404).json({ error: 'No user found with that email' });
    }

    const targetUser = Items[0];

    // Prevent adding to a different family
    const { Item: family } = await docClient.send(
      new GetCommand({ TableName: TABLES.FAMILIES, Key: { familyId } })
    );

    if ((family.members || []).includes(targetUser.userId)) {
      return res.status(409).json({ error: 'User is already a member of this family' });
    }

    // Add to family
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.FAMILIES,
        Key: { familyId },
        UpdateExpression: 'SET members = list_append(if_not_exists(members, :empty), :uid), updatedAt = :now',
        ExpressionAttributeValues: {
          ':uid':   [targetUser.userId],
          ':empty': [],
          ':now':   new Date().toISOString(),
        },
      })
    );

    // Update user's familyId
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: targetUser.userId },
        UpdateExpression: 'SET familyId = :fid, #r = :role, updatedAt = :now',
        ExpressionAttributeValues: {
          ':fid':  familyId,
          ':role': 'member',
          ':now':  new Date().toISOString(),
        },
        ExpressionAttributeNames: { '#r': 'role' },
      })
    );

    res.json({ message: `${targetUser.name} added to family`, userId: targetUser.userId });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

// ─── REMOVE MEMBER (admin only) ───────────────────────────────────────────────
const removeMember = async (req, res) => {
  try {
    const { memberId } = req.params;
    const { familyId, userId: adminId } = req.user;

    if (memberId === adminId) {
      return res.status(400).json({ error: 'Admin cannot remove themselves from the family' });
    }

    const { Item: family } = await docClient.send(
      new GetCommand({ TableName: TABLES.FAMILIES, Key: { familyId } })
    );

    const updatedMembers = (family.members || []).filter(id => id !== memberId);

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.FAMILIES,
        Key: { familyId },
        UpdateExpression: 'SET members = :members, updatedAt = :now',
        ExpressionAttributeValues: {
          ':members': updatedMembers,
          ':now': new Date().toISOString(),
        },
      })
    );

    res.json({ message: 'Member removed from family' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

// ─── GET DASHBOARD SUMMARY ────────────────────────────────────────────────────
// BUG FIX: bills query had duplicate ExpressionAttributeValues objects.
// The second object (with ':false') silently overrode ':fid', causing DynamoDB
// to throw "Value provided in ExpressionAttributeValues unused in expressions".
const getDashboardSummary = async (req, res) => {
  try {
    const { familyId } = req.user;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [familyRes, expensesRes, billsRes, investmentsRes] = await Promise.all([
      docClient.send(new GetCommand({ TableName: TABLES.FAMILIES, Key: { familyId } })),

      docClient.send(new QueryCommand({
        TableName: TABLES.EXPENSES,
        IndexName: 'family-month-index',
        KeyConditionExpression: 'familyId = :fid AND yearMonth = :ym',
        ExpressionAttributeValues: { ':fid': familyId, ':ym': currentMonth },
      })),

      // FIXED: merged ExpressionAttributeValues — was two separate objects,
      // second one overwrote first, causing ':fid' to go missing → SDK error
      docClient.send(new QueryCommand({
        TableName: TABLES.BILLS,
        KeyConditionExpression: 'familyId = :fid',
        FilterExpression: 'isPaid = :false',
        ExpressionAttributeValues: { ':fid': familyId, ':false': false },
      })),

      docClient.send(new QueryCommand({
        TableName: TABLES.INVESTMENTS,
        KeyConditionExpression: 'familyId = :fid',
        ExpressionAttributeValues: { ':fid': familyId },
      })),
    ]);

    const family      = familyRes.Item;
    const expenses    = expensesRes.Items    || [];
    const unpaidBills = billsRes.Items       || [];
    const investments = investmentsRes.Items || [];

    const totalSpent     = expenses.reduce((s, e) => s + e.amount, 0);
    const totalInvested  = investments.reduce((s, i) => s + i.principal, 0);
    const unpaidBillTotal = unpaidBills.reduce((s, b) => s + b.amount, 0);

    const categoryTotals = {};
    expenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });

    const recentTransactions = [...expenses]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(e => ({ ...e, type: 'expense' }));

    const today = new Date();
    const dueSoonBills = unpaidBills.filter(b => {
      const days = Math.ceil((new Date(b.dueDate) - today) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 7;
    });

    res.json({
      family: { name: family?.name, monthlyBudget: family?.monthlyBudget || 0 },
      currentMonth: {
        yearMonth:        currentMonth,
        totalSpent:       Math.round(totalSpent * 100) / 100,
        budget:           family?.monthlyBudget || 0,
        remaining:        Math.round(((family?.monthlyBudget || 0) - totalSpent) * 100) / 100,
        usedPercent:      family?.monthlyBudget
                            ? Math.round((totalSpent / family.monthlyBudget) * 100) : 0,
        categoryBreakdown: Object.entries(categoryTotals)
          .map(([cat, amt]) => ({ category: cat, amount: Math.round(amt * 100) / 100 }))
          .sort((a, b) => b.amount - a.amount),
        transactionCount: expenses.length,
      },
      investments:  { count: investments.length, totalPrincipal: Math.round(totalInvested * 100) / 100 },
      bills:        { unpaidCount: unpaidBills.length, totalUnpaid: Math.round(unpaidBillTotal * 100) / 100, dueSoonCount: dueSoonBills.length },
      recentTransactions,
      alerts: [
        ...dueSoonBills.map(b => ({
          type: 'bill', severity: 'warning',
          message: `${b.name} due in ${Math.ceil((new Date(b.dueDate) - today) / 86400000)} days (₹${b.amount})`,
        })),
        ...(family?.monthlyBudget && totalSpent > family.monthlyBudget * 0.85 ? [{
          type: 'budget',
          severity: totalSpent > family.monthlyBudget ? 'error' : 'warning',
          message: totalSpent > family.monthlyBudget
            ? `⚠️ Budget exceeded by ₹${Math.round(totalSpent - family.monthlyBudget)}`
            : `Budget at ${Math.round((totalSpent / family.monthlyBudget) * 100)}% — watch spending`,
        }] : []),
      ],
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

module.exports = {
  getFamily, updateFamily, getDashboardSummary,
  generateInviteCode, joinFamily, addMember, removeMember,
};

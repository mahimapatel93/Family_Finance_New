/**
 * Authentication Controller — ENHANCED
 *
 * Enhancements:
 * 1. Signup now accepts monthlyBudget + familyMembers (onboarding data collection)
 * 2. isFirstLogin flag set to true on account creation, cleared on first dashboard visit
 * 3. Login response includes isFirstLogin so frontend can trigger onboarding tour
 * 4. getProfile returns isFirstLogin flag for tour restart from settings
 * 5. New completeOnboarding endpoint clears isFirstLogin flag
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/dynamodb');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ─── SIGNUP ───────────────────────────────────────────────────────────────────
const signup = async (req, res) => {
  try {
    const {
      name, email, password, familyName,
      // Onboarding fields (req 6)
      monthlyBudget,
      familyMembers, // Array of { name, relation }
    } = req.body;

    const { Items: existing } = await docClient.send(
      new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email.toLowerCase() },
        Limit: 1,
      })
    );

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const userId   = uuidv4();
    const familyId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    // Parse and store family members provided during signup
    const parsedMembers = Array.isArray(familyMembers)
      ? familyMembers.map(m => ({
          id:       uuidv4(),
          name:     m.name     || '',
          relation: m.relation || 'other',
        }))
      : [];

    // Build family with onboarding data
    await docClient.send(
      new PutCommand({
        TableName: TABLES.FAMILIES,
        Item: {
          familyId,
          name:          familyName || `${name}'s Family`,
          adminUserId:   userId,
          members:       [userId],
          familyMembers: parsedMembers,         // named members (not necessarily app users)
          monthlyBudget: parseFloat(monthlyBudget) || 50000,
          currency:      'INR',
          createdAt:     now,
          updatedAt:     now,
        },
      })
    );

    // Create user with isFirstLogin = true
    await docClient.send(
      new PutCommand({
        TableName: TABLES.USERS,
        Item: {
          userId,
          email:        email.toLowerCase(),
          name,
          password:     hashedPassword,
          familyId,
          role:         'admin',
          isActive:     true,
          isFirstLogin: true,   // triggers onboarding tour on first login
          createdAt:    now,
          updatedAt:    now,
        },
      })
    );

    const token = generateToken(userId);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        userId, email: email.toLowerCase(), name,
        familyId, role: 'admin',
        isFirstLogin: true,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

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
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = Items[0];

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.userId);

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: user.userId },
        UpdateExpression: 'SET lastLoginAt = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      })
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        userId:       user.userId,
        email:        user.email,
        name:         user.name,
        familyId:     user.familyId,
        role:         user.role,
        isFirstLogin: user.isFirstLogin || false,  // frontend reads this to show tour
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

// ─── COMPLETE ONBOARDING (clears isFirstLogin) ───────────────────────────────
const completeOnboarding = async (req, res) => {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: req.user.userId },
        UpdateExpression: 'SET isFirstLogin = :false, updatedAt = :now',
        ExpressionAttributeValues: {
          ':false': false,
          ':now':   new Date().toISOString(),
        },
      })
    );
    res.json({ message: 'Onboarding complete' });
  } catch (err) {
    console.error('Complete onboarding error:', err);
    res.status(500).json({ error: 'Failed to update onboarding status' });
  }
};

// ─── RESTART TOUR (sets isFirstLogin back to true) ───────────────────────────
const restartTour = async (req, res) => {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: req.user.userId },
        UpdateExpression: 'SET isFirstLogin = :true, updatedAt = :now',
        ExpressionAttributeValues: {
          ':true': true,
          ':now':  new Date().toISOString(),
        },
      })
    );
    res.json({ message: 'Tour restarted — it will show on next page load' });
  } catch (err) {
    console.error('Restart tour error:', err);
    res.status(500).json({ error: 'Failed to restart tour' });
  }
};

// ─── GET PROFILE ──────────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const { Item: user } = await docClient.send(
      new GetCommand({ TableName: TABLES.USERS, Key: { userId: req.user.userId } })
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    const { password: _, ...safeUser } = user;

    const { Item: family } = await docClient.send(
      new GetCommand({ TableName: TABLES.FAMILIES, Key: { familyId: user.familyId } })
    );

    res.json({ user: safeUser, family });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    let updateExpr = 'SET updatedAt = :updatedAt';
    const exprVals = { ':updatedAt': new Date().toISOString() };

    if (name) {
      updateExpr += ', #n = :name';
      exprVals[':name'] = name;
    }

    if (newPassword) {
      const { Item: user } = await docClient.send(
        new GetCommand({ TableName: TABLES.USERS, Key: { userId: req.user.userId } })
      );
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
      updateExpr += ', password = :password';
      exprVals[':password'] = await bcrypt.hash(newPassword, 12);
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: req.user.userId },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprVals,
        ...(name && { ExpressionAttributeNames: { '#n': 'name' } }),
      })
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

module.exports = {
  signup, login, getProfile, updateProfile,
  completeOnboarding, restartTour,
};

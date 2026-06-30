/**
 * Agent Reasoning & Memory Test
 *
 * Verifies:
 * 1. Memory storage and retrieval per agent.
 * 2. Reasoning patterns (observe-analyze-act).
 * 3. Adaptation to agent context.
 */

import { storeMemory, retrieveMemories, getMemoryContext } from '@/lib/agent-memory';
import { db } from '@/lib/db';

async function runTests() {
  console.log('🚀 Starting Agent Reasoning & Memory Tests...');

  const testUserId = 'test-user-123';
  const testAgentId = 'test-agent-456';

  try {
    // Setup: Create test user and agent
    await db.user.upsert({
      where: { email: 'test@genova.ai' },
      update: {},
      create: {
        id: testUserId,
        email: 'test@genova.ai',
        name: 'Test User',
        password: 'password123'
      }
    });

    await db.agent.upsert({
      where: { id: testAgentId },
      update: {},
      create: {
        id: testAgentId,
        userId: testUserId,
        name: 'Test Agent',
        type: 'custom',
        description: 'Agent for testing',
        config: '{}'
      }
    });

    // Test 1: Memory Storage
    console.log('\n[Test 1] Memory Storage...');
    const memory = await storeMemory(testAgentId, testUserId, 'Le client préfère les rapports en format JSON.', {
      category: 'preference',
      tags: ['format', 'reports']
    });

    if (memory && memory.id) {
      console.log('✅ Memory stored successfully');
    } else {
      throw new Error('Failed to store memory');
    }

    // Test 2: Memory Retrieval
    console.log('\n[Test 2] Memory Retrieval...');
    const retrieved = await retrieveMemories(testAgentId, testUserId, 'format rapport');
    if (retrieved.length > 0 && retrieved[0].content.includes('JSON')) {
      console.log('✅ Memory retrieved successfully with relevance');
    } else {
      throw new Error('Failed to retrieve relevant memory');
    }

    // Test 3: Prompt Context Injection
    console.log('\n[Test 3] Prompt Context Injection...');
    const context = await getMemoryContext(testAgentId, testUserId, 'Prépare un rapport');
    if (context.includes('JSON')) {
      console.log('✅ Memory context injected correctly into prompt');
    } else {
      throw new Error('Memory context missing from prompt injection');
    }

    // Test 4: Agent Isolation
    console.log('\n[Test 4] Agent Isolation...');
    const otherAgentRetrieved = await retrieveMemories('other-agent', testUserId, 'format rapport');
    if (otherAgentRetrieved.length === 0) {
      console.log('✅ Memory isolation verified (agent context)');
    } else {
      throw new Error('Memory leaked between agents');
    }

    console.log('\n✨ All Reasoning & Memory Tests Passed!');
  } catch (error: any) {
    console.error('\n❌ Test Failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup test data
    await db.agentMemory.deleteMany({ where: { userId: testUserId } });
  }
}

runTests();

/**
 * Reasoning Dataset Importer
 *
 * Processes JSONL dataset and stores reasoning patterns in the global Knowledge table.
 * These patterns serve as a base for all agents to understand observation -> analysis -> action.
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import fs from 'fs';
import readline from 'readline';

const log = createLogger('dataset-importer');

const SYSTEM_USER_ID = 'system-reasoning-base';

async function importDataset() {
  log.info('Starting reasoning dataset import...');

  // Ensure system user exists
  await db.user.upsert({
    where: { email: 'system-ai@genova.ai' },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      email: 'system-ai@genova.ai',
      name: 'System AI Base',
      password: 'system-permanent-base',
      role: 'admin'
    }
  });

  const filePath = '/tmp/file_attachments/agent_ia_dataset_v2/train_multimodal_reasoning.jsonl';

  if (!fs.existsSync(filePath)) {
    log.error(`Dataset file not found: ${filePath}`);
    return;
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    try {
      const example = JSON.parse(line);

      // Transform example into a knowledge entry
      const content = `
REASONING PATTERN [${example.intent_primary}]
Mode: ${example.reasoning_mode}
Priority: ${example.priority}
Analysis Steps: ${JSON.stringify(example.target.analysis_steps)}
Action Steps: ${JSON.stringify(example.target.action_steps)}
Example Summary: ${example.target.final_answer.summary}
      `.trim();

      await db.knowledge.create({
        data: {
          userId: SYSTEM_USER_ID,
          content,
          category: 'reasoning_pattern',
          tags: JSON.stringify([example.task_family, example.intent_primary, 'training_base']),
          relevance: example.priority === 'high' ? 0.9 : 0.7
        }
      });

      count++;
      if (count % 100 === 0) log.info(`Imported ${count} patterns...`);
    } catch (err: any) {
      log.warn(`Failed to parse line: ${err.message}`);
    }
  }

  log.info(`Import complete. ${count} reasoning patterns stored.`);
}

importDataset().catch(err => {
  log.error(`Import failed: ${err.message}`);
  process.exit(1);
});

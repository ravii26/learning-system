import type { PrismaClient, Prisma } from '@prisma/client';
import { syncCurriculumFromJson } from './curriculumSync';
import { syncResourcesFromJson } from './resourceSync';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * For topic-creation paths (POST /api/topics, the goals roadmap, capture ->
 * topic), which create the Topic with its JSON arrays first: creates the
 * CurriculumItem/Resource rows and writes the rebuilt mirrors (which now
 * carry ids) back onto the topic. Only the lists actually passed are synced.
 */
export async function syncTopicListsAndMirror(
  db: DbClient,
  userId: string,
  topicId: string,
  lists: { curriculum?: unknown; resources?: unknown }
): Promise<void> {
  const data: Prisma.TopicUpdateInput = {};
  if (Array.isArray(lists.curriculum)) data.curriculum = (await syncCurriculumFromJson(db, userId, topicId, lists.curriculum)) as unknown as Prisma.InputJsonValue;
  if (Array.isArray(lists.resources)) data.resources = (await syncResourcesFromJson(db, userId, topicId, lists.resources)) as unknown as Prisma.InputJsonValue;
  if (Object.keys(data).length > 0) {
    await db.topic.update({ where: { id: topicId }, data });
  }
}

export interface TopicPayload {
  title?: string;
  area?: string;
  why?: string | null;
  depthTarget?: string | null;
  status?: string;
  progressPct?: number;
  currentStage?: string;
  lastCompleted?: string | null;
  nextAction?: string | null;
  proofOfLearning?: string | null;
  resources?: any[];
  subtasks?: any[];
  notes?: string | null;
  contract?: any;
  knowledgeMap?: any;
  confusions?: any[];
  mistakes?: any[];
  pauseHistory?: any[];
  activeSlotType?: string | null;
  sessionLogs?: any[];
  topicMode?: 'self_directed' | 'course';
  curriculum?: any[];
  mode?: 'syllabus' | 'practice' | 'accretion' | 'reference';
  skillId?: string | null;
}

export const VALID_MODES = ['syllabus', 'practice', 'accretion', 'reference'];

export const VALID_STATUSES = ['inbox', 'queued', 'active', 'paused', 'maintenance', 'reference', 'dropped'];
export const VALID_AREAS = ['Tech', 'Business', 'Finance', 'Creative', 'Personal', 'Other'];
export const VALID_DEPTHS = ['Awareness', 'Working Knowledge', 'Proficiency', 'Deep', 'Mastery'];

export function validateTopicPayload(body: any, isCreate = false): { isValid: boolean; error?: string; payload?: TopicPayload } {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Invalid JSON payload' };
  }

  if (isCreate && (!body.title || typeof body.title !== 'string' || !body.title.trim())) {
    return { isValid: false, error: 'Title is required' };
  }

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return { isValid: false, error: `Invalid status: ${body.status}` };
  }

  if (body.mode && !VALID_MODES.includes(body.mode)) {
    return { isValid: false, error: `Invalid mode: ${body.mode}` };
  }

  if (body.progressPct !== undefined) {
    const num = Number(body.progressPct);
    if (isNaN(num) || num < 0 || num > 100) {
      return { isValid: false, error: 'Progress percentage must be between 0 and 100' };
    }
  }

  // Ensure JSON fields are arrays/objects if provided
  const arrayFields = ['resources', 'subtasks', 'confusions', 'mistakes', 'pauseHistory', 'sessionLogs', 'curriculum'];
  for (const field of arrayFields) {
    if (body[field] !== undefined && !Array.isArray(body[field])) {
      return { isValid: false, error: `Field '${field}' must be an array` };
    }
  }

  if (body.knowledgeMap !== undefined && (typeof body.knowledgeMap !== 'object' || body.knowledgeMap === null)) {
    return { isValid: false, error: "Field 'knowledgeMap' must be an object" };
  }

  return { isValid: true, payload: body };
}

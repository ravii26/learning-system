-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "catalogKey" TEXT,
ADD COLUMN     "linkCheckedAt" TIMESTAMP(3),
ADD COLUMN     "linkStatus" TEXT NOT NULL DEFAULT 'unchecked',
ADD COLUMN     "pricing" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "quality" TEXT NOT NULL DEFAULT 'unreviewed',
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'reference',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "field" TEXT NOT NULL,
    "mapQuality" TEXT NOT NULL,
    "intake" JSONB NOT NULL,
    "competencyMap" JSONB NOT NULL,
    "whyThisPlan" TEXT NOT NULL,
    "hoursPerWeek" INTEGER NOT NULL,
    "totalWeeks" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "phaseTitle" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "shape" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "competencyKeys" TEXT[],
    "hoursPerWeek" DOUBLE PRECISION NOT NULL,
    "weeks" INTEGER NOT NULL,
    "resourceKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "details" JSONB,
    "topicId" TEXT,

    CONSTRAINT "ProgramItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "competencyKeys" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "metAt" TIMESTAMP(3),

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyEvidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "competencyKey" TEXT NOT NULL,
    "required" JSONB NOT NULL,
    "actual" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetencyEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "fromVersion" INTEGER,
    "toVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "changes" JSONB NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCheckin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "programVersion" INTEGER NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "actualMinutes" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL,
    "proposal" JSONB,
    "decisions" JSONB,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Program_userId_status_idx" ON "Program"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Program_goalId_version_key" ON "Program"("goalId", "version");

-- CreateIndex
CREATE INDEX "ProgramItem_programId_phase_order_idx" ON "ProgramItem"("programId", "phase", "order");

-- CreateIndex
CREATE INDEX "Checkpoint_programId_phase_idx" ON "Checkpoint"("programId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyEvidence_programId_competencyKey_key" ON "CompetencyEvidence"("programId", "competencyKey");

-- CreateIndex
CREATE INDEX "ProgramChange_goalId_toVersion_idx" ON "ProgramChange"("goalId", "toVersion");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCheckin_goalId_weekStart_key" ON "WeeklyCheckin"("goalId", "weekStart");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItem" ADD CONSTRAINT "ProgramItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItem" ADD CONSTRAINT "ProgramItem_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItem" ADD CONSTRAINT "ProgramItem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyEvidence" ADD CONSTRAINT "CompetencyEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyEvidence" ADD CONSTRAINT "CompetencyEvidence_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramChange" ADD CONSTRAINT "ProgramChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramChange" ADD CONSTRAINT "ProgramChange_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCheckin" ADD CONSTRAINT "WeeklyCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyCheckin" ADD CONSTRAINT "WeeklyCheckin_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "FieldMap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL DEFAULT '',
    "competencies" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "basedOn" TEXT,
    "sharedFromUserId" TEXT,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldResource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ARTICLE',
    "pricing" TEXT NOT NULL DEFAULT 'unknown',
    "role" TEXT NOT NULL DEFAULT 'reference',
    "competencyKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT NOT NULL DEFAULT '',
    "linkStatus" TEXT NOT NULL DEFAULT 'ok',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldMapShare" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "FieldMapShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldMap_userId_key_key" ON "FieldMap"("userId", "key");

-- CreateIndex
CREATE INDEX "FieldResource_userId_fieldKey_idx" ON "FieldResource"("userId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "FieldResource_userId_fieldKey_url_key" ON "FieldResource"("userId", "fieldKey", "url");

-- CreateIndex
CREATE INDEX "FieldMapShare_toUserId_status_idx" ON "FieldMapShare"("toUserId", "status");

-- AddForeignKey
ALTER TABLE "FieldMap" ADD CONSTRAINT "FieldMap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldResource" ADD CONSTRAINT "FieldResource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldMapShare" ADD CONSTRAINT "FieldMapShare_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldMapShare" ADD CONSTRAINT "FieldMapShare_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


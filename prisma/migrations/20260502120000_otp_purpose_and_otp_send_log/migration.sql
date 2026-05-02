-- AlterTable
ALTER TABLE "OtpVerification" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'login';

-- CreateIndex
CREATE INDEX "OtpVerification_phone_purpose_idx" ON "OtpVerification"("phone", "purpose");

-- CreateTable
CREATE TABLE "OtpSendLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtpSendLog_phone_sentAt_idx" ON "OtpSendLog"("phone", "sentAt");

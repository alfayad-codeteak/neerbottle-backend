-- Global dispatch flags (admin-controlled partner self-assign).
CREATE TABLE "DispatchSettings" (
    "id" TEXT NOT NULL,
    "partnerSelfAssignEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DispatchSettings" ("id", "partnerSelfAssignEnabled", "createdAt", "updatedAt")
VALUES ('default', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "Dispense" ADD COLUMN "pharmacistNote" TEXT;
ALTER TABLE "Dispense" ADD COLUMN "safetyWarningsReviewed" BOOLEAN NOT NULL DEFAULT false;
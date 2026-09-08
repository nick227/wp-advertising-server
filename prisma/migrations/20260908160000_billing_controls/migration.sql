CREATE TABLE `BillingConfig` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `monthlyPriceId` VARCHAR(255) NOT NULL DEFAULT '',
  `annualPriceId` VARCHAR(255) NOT NULL DEFAULT '',
  `monthlyAmount` INTEGER NOT NULL DEFAULT 2900,
  `annualAmount` INTEGER NOT NULL DEFAULT 0,
  `monthlyEnabled` BOOLEAN NOT NULL DEFAULT false,
  `annualEnabled` BOOLEAN NOT NULL DEFAULT false,
  `trialDays` INTEGER NOT NULL DEFAULT 30,
  `failureGraceDays` INTEGER NOT NULL DEFAULT 3,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `BillingSyncLock` (`id` INTEGER NOT NULL, PRIMARY KEY (`id`));
INSERT INTO `BillingSyncLock` (`id`) VALUES (1);
ALTER TABLE `License`
 ADD COLUMN `paidThrough` DATETIME(3) NULL,
 ADD COLUMN `graceUntil` DATETIME(3) NULL,
 ADD COLUMN `failureInvoiceId` VARCHAR(255) NULL,
 ADD COLUMN `failureGraceDays` INTEGER NULL,
 ADD COLUMN `stripeSyncedAt` DATETIME(3) NULL;

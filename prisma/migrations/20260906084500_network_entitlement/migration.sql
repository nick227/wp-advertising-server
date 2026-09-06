-- AlterTable
ALTER TABLE `CommunitySite`
  ADD COLUMN `networkStatus` ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED') NULL,
  ADD COLUMN `networkTrialStartedAt` DATETIME(3) NULL,
  ADD COLUMN `networkAccessUntil` DATETIME(3) NULL,
  ADD COLUMN `category` VARCHAR(64) NULL,
  ADD COLUMN `publicIdentityOptIn` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `CommunitySite_networkStatus_networkAccessUntil_idx` ON `CommunitySite`(`networkStatus`, `networkAccessUntil`);

-- CreateTable
CREATE TABLE `License` (
  `id` VARCHAR(191) NOT NULL,
  `licenseKey` VARCHAR(96) NOT NULL,
  `status` ENUM('ACTIVE', 'EXPIRED', 'REVOKED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  `maxActivations` INTEGER NOT NULL DEFAULT 1,
  `expiresAt` DATETIME(3) NULL,
  `customerEmail` VARCHAR(255) NULL,
  `stripeCustomerId` VARCHAR(64) NULL,
  `stripeSubscriptionId` VARCHAR(64) NULL,
  `notes` VARCHAR(512) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `License_licenseKey_key`(`licenseKey`),
  INDEX `License_status_expiresAt_idx`(`status`, `expiresAt`),
  INDEX `License_customerEmail_idx`(`customerEmail`),
  INDEX `License_stripeSubscriptionId_idx`(`stripeSubscriptionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LicenseActivation` (
  `id` VARCHAR(191) NOT NULL,
  `licenseId` VARCHAR(191) NOT NULL,
  `siteId` VARCHAR(191) NOT NULL,
  `domainSnapshot` VARCHAR(255) NOT NULL,
  `pluginVersion` VARCHAR(48) NULL,
  `activatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastValidatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deactivatedAt` DATETIME(3) NULL,

  INDEX `LicenseActivation_siteId_idx`(`siteId`),
  INDEX `LicenseActivation_lastValidatedAt_idx`(`lastValidatedAt`),
  UNIQUE INDEX `LicenseActivation_licenseId_siteId_key`(`licenseId`, `siteId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LicenseActivation` ADD CONSTRAINT `LicenseActivation_licenseId_fkey` FOREIGN KEY (`licenseId`) REFERENCES `License`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LicenseActivation` ADD CONSTRAINT `LicenseActivation_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `CommunitySite`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `CommunitySite` (
    `id` VARCHAR(191) NOT NULL,
    `siteUrl` VARCHAR(512) NOT NULL,
    `siteDomain` VARCHAR(255) NOT NULL,
    `siteName` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
    `optedIn` BOOLEAN NOT NULL DEFAULT false,
    `publicKey` VARCHAR(96) NOT NULL,
    `pluginVersion` VARCHAR(48) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CommunitySite_siteUrl_key`(`siteUrl`),
    UNIQUE INDEX `CommunitySite_siteDomain_key`(`siteDomain`),
    UNIQUE INDEX `CommunitySite_publicKey_key`(`publicKey`),
    INDEX `CommunitySite_optedIn_status_idx`(`optedIn`, `status`),
    INDEX `CommunitySite_status_optedIn_idx`(`status`, `optedIn`),
    INDEX `CommunitySite_lastSeenAt_idx`(`lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommunityAd` (
    `id` VARCHAR(191) NOT NULL,
    `siteId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `imageUrl` VARCHAR(1024) NOT NULL,
    `targetUrl` VARCHAR(1024) NOT NULL,
    `status` ENUM('ACTIVE', 'PAUSED', 'BLOCKED', 'PENDING', 'REJECTED') NOT NULL DEFAULT 'ACTIVE',
    `weight` INTEGER NOT NULL DEFAULT 1,
    `servedCount` INTEGER NOT NULL DEFAULT 0,
    `clickCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CommunityAd_status_idx`(`status`),
    INDEX `CommunityAd_siteId_status_idx`(`siteId`, `status`),
    INDEX `CommunityAd_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommunityEvent` (
    `id` VARCHAR(191) NOT NULL,
    `adId` VARCHAR(191) NULL,
    `sourceSiteId` VARCHAR(191) NULL,
    `targetSiteId` VARCHAR(191) NULL,
    `type` ENUM('IMPRESSION', 'CLICK') NOT NULL,
    `referrerDomain` VARCHAR(255) NULL,
    `userAgentHash` VARCHAR(96) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommunityEvent_type_createdAt_idx`(`type`, `createdAt`),
    INDEX `CommunityEvent_adId_type_idx`(`adId`, `type`),
    INDEX `CommunityEvent_adId_createdAt_idx`(`adId`, `createdAt`),
    INDEX `CommunityEvent_sourceSiteId_createdAt_idx`(`sourceSiteId`, `createdAt`),
    INDEX `CommunityEvent_targetSiteId_createdAt_idx`(`targetSiteId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommunityEventRollup` (
    `id` VARCHAR(191) NOT NULL,
    `adId` VARCHAR(191) NOT NULL,
    `sourceSiteId` VARCHAR(191) NOT NULL DEFAULT '',
    `type` ENUM('IMPRESSION', 'CLICK') NOT NULL,
    `bucketMinute` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CommunityEventRollup_bucketMinute_idx`(`bucketMinute`),
    INDEX `CommunityEventRollup_adId_bucketMinute_idx`(`adId`, `bucketMinute`),
    INDEX `CommunityEventRollup_sourceSiteId_bucketMinute_idx`(`sourceSiteId`, `bucketMinute`),
    UNIQUE INDEX `CommunityEventRollup_adId_sourceSiteId_type_bucketMinute_key`(`adId`, `sourceSiteId`, `type`, `bucketMinute`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlockedDomain` (
    `id` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(255) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BlockedDomain_domain_key`(`domain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CommunityAd` ADD CONSTRAINT `CommunityAd_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `CommunitySite`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommunityEvent` ADD CONSTRAINT `CommunityEvent_adId_fkey` FOREIGN KEY (`adId`) REFERENCES `CommunityAd`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommunityEvent` ADD CONSTRAINT `CommunityEvent_sourceSiteId_fkey` FOREIGN KEY (`sourceSiteId`) REFERENCES `CommunitySite`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommunityEvent` ADD CONSTRAINT `CommunityEvent_targetSiteId_fkey` FOREIGN KEY (`targetSiteId`) REFERENCES `CommunitySite`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

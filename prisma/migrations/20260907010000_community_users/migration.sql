-- Clean-cut forum identity: site-tied membership → email/password users

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `CommunityComment`;
DROP TABLE IF EXISTS `CommunityPost`;
DROP TABLE IF EXISTS `CommunityMembership`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `CommunityUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `displayName` VARCHAR(120) NOT NULL,
    `role` ENUM('MEMBER', 'MODERATOR', 'ADMIN') NOT NULL DEFAULT 'MEMBER',
    `canPost` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CommunityUser_email_key`(`email`),
    INDEX `CommunityUser_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommunityPost` (
    `id` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `type` ENUM('DISCUSSION', 'ANNOUNCEMENT', 'POLICY', 'HELP') NOT NULL DEFAULT 'DISCUSSION',
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `slug` VARCHAR(220) NOT NULL,
    `isPinned` BOOLEAN NOT NULL DEFAULT false,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `category` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CommunityPost_slug_key`(`slug`),
    INDEX `CommunityPost_isPinned_createdAt_idx`(`isPinned`, `createdAt`),
    INDEX `CommunityPost_createdAt_idx`(`createdAt`),
    INDEX `CommunityPost_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CommunityComment` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CommunityComment_postId_createdAt_idx`(`postId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CommunityPost` ADD CONSTRAINT `CommunityPost_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `CommunityUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CommunityComment` ADD CONSTRAINT `CommunityComment_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `CommunityPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CommunityComment` ADD CONSTRAINT `CommunityComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `CommunityUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

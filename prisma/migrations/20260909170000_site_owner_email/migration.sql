ALTER TABLE `CommunitySite` ADD COLUMN `ownerEmail` VARCHAR(255) NULL;
CREATE INDEX `CommunitySite_ownerEmail_idx` ON `CommunitySite`(`ownerEmail`);

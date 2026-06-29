CREATE TABLE `composed_deck_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deckId` int NOT NULL,
	`position` int NOT NULL,
	`documentPageId` int NOT NULL,
	`narrationAssetId` int,
	`customNarrationUrl` text,
	`customNarrationKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `composed_deck_slots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `composed_decks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderId` int NOT NULL,
	`createdByUserId` int,
	`createdByMemberId` int,
	`name` varchar(256) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `composed_decks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folder_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderId` int NOT NULL,
	`documentId` int NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `folder_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folder_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(256),
	`token` varchar(64) NOT NULL,
	`role` enum('viewer','editor') NOT NULL DEFAULT 'editor',
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `folder_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `folder_members_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `narration_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderId` int NOT NULL,
	`documentId` int,
	`pageNumber` int,
	`label` varchar(256),
	`videoUrl` text NOT NULL,
	`videoKey` varchar(512) NOT NULL,
	`durationSeconds` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `narration_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `analytics_events` MODIFY COLUMN `documentId` int;--> statement-breakpoint
ALTER TABLE `share_links` MODIFY COLUMN `documentId` int;--> statement-breakpoint
ALTER TABLE `analytics_events` ADD `composedDeckId` int;--> statement-breakpoint
ALTER TABLE `share_links` ADD `composedDeckId` int;
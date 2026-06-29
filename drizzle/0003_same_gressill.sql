CREATE TABLE `document_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`fileType` enum('pdf','pptx') NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`pageCount` int NOT NULL DEFAULT 0,
	`status` enum('processing','ready','error') NOT NULL DEFAULT 'processing',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `document_pages` ADD `versionId` int;--> statement-breakpoint
ALTER TABLE `documents` ADD `currentVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `share_links` ADD `label` varchar(256);--> statement-breakpoint
ALTER TABLE `share_links` ADD `slideConfig` json;
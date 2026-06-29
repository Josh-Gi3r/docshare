CREATE TABLE `analytics_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shareLinkId` int NOT NULL,
	`documentId` int NOT NULL,
	`visitorHash` varchar(64),
	`eventType` enum('view','page_view','time_spent') NOT NULL,
	`pageNumber` int,
	`secondsSpent` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`pageNumber` int NOT NULL,
	`thumbnailUrl` text NOT NULL,
	`thumbnailKey` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`fileType` enum('pdf','pptx') NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`pageCount` int NOT NULL DEFAULT 0,
	`status` enum('processing','ready','error') NOT NULL DEFAULT 'processing',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`userId` int NOT NULL,
	`slug` varchar(64) NOT NULL,
	`ogPreviewPageNumber` int NOT NULL DEFAULT 1,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`password` varchar(256),
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `share_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `share_links_slug_unique` UNIQUE(`slug`)
);

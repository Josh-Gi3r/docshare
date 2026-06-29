CREATE TABLE `video_slides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`pageNumber` int NOT NULL,
	`videoUrl` text NOT NULL,
	`videoKey` varchar(512) NOT NULL,
	`thumbnailUrl` text,
	`thumbnailKey` varchar(512),
	`durationSeconds` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_slides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `share_links` ADD `videoControls` json;
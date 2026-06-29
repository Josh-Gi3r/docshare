CREATE TABLE `auth_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`token` varchar(8) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media_library` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(256),
	`videoUrl` text NOT NULL,
	`videoKey` varchar(512) NOT NULL,
	`type` enum('narration','video') NOT NULL DEFAULT 'narration',
	`durationSeconds` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_library_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `slide_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentPageId` int NOT NULL,
	`documentId` int NOT NULL,
	`tag` enum('present') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `slide_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `folders` ADD `isSystemFolder` boolean DEFAULT false NOT NULL;
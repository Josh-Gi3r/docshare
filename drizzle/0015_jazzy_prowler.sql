CREATE TABLE `narration_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mediaLibraryId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`videoUrl` text NOT NULL,
	`videoKey` varchar(512) NOT NULL,
	`durationSeconds` float,
	`fileSizeBytes` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `narration_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `slide_narrations` ADD `mediaLibraryId` int;
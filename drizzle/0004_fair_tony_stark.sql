CREATE TABLE `slide_narrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`pageNumber` int NOT NULL,
	`videoUrl` text NOT NULL,
	`videoKey` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `slide_narrations_id` PRIMARY KEY(`id`)
);

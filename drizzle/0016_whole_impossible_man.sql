CREATE TABLE `user_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`openId` varchar(255) NOT NULL,
	`email` varchar(255),
	`createdAt` varchar(64) NOT NULL,
	CONSTRAINT `user_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_aliases_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
ALTER TABLE `slide_narrations` ADD `versionId` int;
CREATE TABLE `folder_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `folder_sections_id` PRIMARY KEY(`id`)
);

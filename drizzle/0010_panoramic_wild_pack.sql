CREATE TABLE `sub_deck_slides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subDeckId` int NOT NULL,
	`documentPageId` int NOT NULL,
	`position` int NOT NULL,
	`isVisible` boolean NOT NULL DEFAULT true,
	`narrationOverrideUrl` text,
	`narrationOverrideKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sub_deck_slides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sub_decks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sub_decks_id` PRIMARY KEY(`id`)
);

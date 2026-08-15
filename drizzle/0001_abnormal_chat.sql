CREATE TABLE `app_installations` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`appId` varchar(36) NOT NULL,
	`installedVersionId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_installations_id` PRIMARY KEY(`id`),
	CONSTRAINT `installations_user_app_unique` UNIQUE(`userId`,`appId`)
);
--> statement-breakpoint
CREATE TABLE `app_versions` (
	`id` varchar(36) NOT NULL,
	`appId` varchar(36) NOT NULL,
	`version` varchar(32) NOT NULL,
	`htmlStorageKey` varchar(512) NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`contentSize` int NOT NULL,
	`releaseNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_versions_app_version_unique` UNIQUE(`appId`,`version`)
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` varchar(36) NOT NULL,
	`publisherId` int NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(96) NOT NULL,
	`description` text NOT NULL,
	`icon` varchar(32) NOT NULL DEFAULT '◈',
	`status` enum('active','deprecated','deleted') NOT NULL DEFAULT 'active',
	`currentVersionId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apps_id` PRIMARY KEY(`id`),
	CONSTRAINT `apps_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`wallpaper` enum('aurora','glacier','dusk','void') NOT NULL DEFAULT 'aurora',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `preferences_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `app_installations` ADD CONSTRAINT `app_installations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `app_installations` ADD CONSTRAINT `app_installations_appId_apps_id_fk` FOREIGN KEY (`appId`) REFERENCES `apps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `app_installations` ADD CONSTRAINT `app_installations_installedVersionId_app_versions_id_fk` FOREIGN KEY (`installedVersionId`) REFERENCES `app_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `app_versions` ADD CONSTRAINT `app_versions_appId_apps_id_fk` FOREIGN KEY (`appId`) REFERENCES `apps`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `apps` ADD CONSTRAINT `apps_publisherId_users_id_fk` FOREIGN KEY (`publisherId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD CONSTRAINT `user_preferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `installations_user_index` ON `app_installations` (`userId`);--> statement-breakpoint
CREATE INDEX `app_versions_app_index` ON `app_versions` (`appId`);--> statement-breakpoint
CREATE INDEX `apps_publisher_index` ON `apps` (`publisherId`);--> statement-breakpoint
CREATE INDEX `apps_status_index` ON `apps` (`status`);
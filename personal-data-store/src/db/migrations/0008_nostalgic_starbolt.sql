ALTER TABLE "wallets" ADD COLUMN "wallet_type" text DEFAULT 'onchain' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_address_chain_uniq" UNIQUE("address","chain");
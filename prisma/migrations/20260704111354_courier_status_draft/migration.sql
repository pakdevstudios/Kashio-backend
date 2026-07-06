-- Add DRAFT state for admin call-in orders that are still being built.
ALTER TYPE "CourierStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

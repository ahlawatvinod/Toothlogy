-- CreateEnum
CREATE TYPE "VariantStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'DECLINED');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('UNPAID', 'PARTLY_PAID', 'PAID', 'PARTLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderPaymentKind" AS ENUM ('RECEIPT', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD_ON_DELIVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxDocumentKind" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'EXPIRED', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_USE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ServiceContractKind" AS ENUM ('AMC', 'CMC');

-- CreateEnum
CREATE TYPE "ServiceContractStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ServiceVisitKind" AS ENUM ('PREVENTIVE', 'BREAKDOWN');

-- CreateEnum
CREATE TYPE "ServiceVisitStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "business_profiles" ADD COLUMN     "paymentInstructions" TEXT,
ADD COLUMN     "returnWindowDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "orderable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxCode" TEXT;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sku" TEXT,
    "priceMinor" BIGINT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "status" "VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "lineKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "sellerOrganizationId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "buyerOrganizationId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "currency" TEXT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "refundedMinor" BIGINT NOT NULL DEFAULT 0,
    "deliveryName" TEXT NOT NULL,
    "deliveryPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryDistrictId" TEXT NOT NULL,
    "buyerTaxIdentifier" TEXT,
    "buyerNote" TEXT,
    "sellerNote" TEXT,
    "cancelReason" TEXT,
    "carrier" TEXT,
    "trackingReference" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "variantLabel" TEXT,
    "sku" TEXT,
    "unit" TEXT,
    "taxCode" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "taxRateBasisPoints" INTEGER NOT NULL,
    "netMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "grossMinor" BIGINT NOT NULL,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "returnRequestId" TEXT,
    "kind" "OrderPaymentKind" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "reference" TEXT,
    "receivedOn" TIMESTAMP(3) NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_documents" (
    "id" TEXT NOT NULL,
    "kind" "TaxDocumentKind" NOT NULL,
    "number" TEXT NOT NULL,
    "sellerOrganizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceKey" TEXT,
    "returnRequestId" TEXT,
    "fiscalYear" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL,
    "taxRegime" "TaxRegime" NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sellerTaxIdentifier" TEXT,
    "sellerAddress" TEXT,
    "sellerRegion" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerTaxIdentifier" TEXT,
    "buyerAddress" TEXT NOT NULL,
    "placeOfSupply" TEXT NOT NULL,
    "supplyKind" TEXT,
    "lines" JSONB NOT NULL,
    "taxBreakdown" JSONB NOT NULL,
    "netMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,

    CONSTRAINT "tax_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_document_series" (
    "sellerOrganizationId" TEXT NOT NULL,
    "kind" "TaxDocumentKind" NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL,

    CONSTRAINT "tax_document_series_pkey" PRIMARY KEY ("sellerOrganizationId","kind","fiscalYear")
);

-- CreateTable
CREATE TABLE "return_requests" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" "ReturnReason" NOT NULL,
    "details" TEXT,
    "lines" JSONB NOT NULL,
    "refundMinor" BIGINT NOT NULL,
    "sellerNote" TEXT,
    "openKey" TEXT,
    "decidedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierOrganizationId" TEXT,
    "orderLineId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "purchasedOn" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_USE',
    "notes" TEXT,
    "warrantyReminderFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_contracts" (
    "id" TEXT NOT NULL,
    "kind" "ServiceContractKind" NOT NULL,
    "providerOrganizationId" TEXT NOT NULL,
    "clientOrganizationId" TEXT NOT NULL,
    "status" "ServiceContractStatus" NOT NULL DEFAULT 'PROPOSED',
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "visitsIncluded" INTEGER NOT NULL,
    "responseHours" INTEGER,
    "priceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "terms" TEXT,
    "proposedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "expiryReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_contract_assets" (
    "contractId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "service_contract_assets_pkey" PRIMARY KEY ("contractId","assetId")
);

-- CreateTable
CREATE TABLE "service_visits" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "assetId" TEXT,
    "kind" "ServiceVisitKind" NOT NULL,
    "status" "ServiceVisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "issue" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "report" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_label_key" ON "product_variants"("productId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_lineKey_key" ON "cart_items"("lineKey");

-- CreateIndex
CREATE INDEX "cart_items_userId_idx" ON "cart_items"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_sellerOrganizationId_status_placedAt_idx" ON "orders"("sellerOrganizationId", "status", "placedAt");

-- CreateIndex
CREATE INDEX "orders_buyerUserId_placedAt_idx" ON "orders"("buyerUserId", "placedAt");

-- CreateIndex
CREATE INDEX "order_lines_orderId_idx" ON "order_lines"("orderId");

-- CreateIndex
CREATE INDEX "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_payments_orderId_idx" ON "order_payments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_documents_invoiceKey_key" ON "tax_documents"("invoiceKey");

-- CreateIndex
CREATE UNIQUE INDEX "tax_documents_returnRequestId_key" ON "tax_documents"("returnRequestId");

-- CreateIndex
CREATE INDEX "tax_documents_orderId_idx" ON "tax_documents"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_documents_sellerOrganizationId_kind_fiscalYear_sequence_key" ON "tax_documents"("sellerOrganizationId", "kind", "fiscalYear", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "tax_documents_sellerOrganizationId_number_key" ON "tax_documents"("sellerOrganizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_openKey_key" ON "return_requests"("openKey");

-- CreateIndex
CREATE INDEX "return_requests_orderId_idx" ON "return_requests"("orderId");

-- CreateIndex
CREATE INDEX "equipment_assets_organizationId_status_idx" ON "equipment_assets"("organizationId", "status");

-- CreateIndex
CREATE INDEX "equipment_assets_warrantyUntil_idx" ON "equipment_assets"("warrantyUntil");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_assets_organizationId_serialNumber_key" ON "equipment_assets"("organizationId", "serialNumber");

-- CreateIndex
CREATE INDEX "service_contracts_providerOrganizationId_status_idx" ON "service_contracts"("providerOrganizationId", "status");

-- CreateIndex
CREATE INDEX "service_contracts_clientOrganizationId_status_idx" ON "service_contracts"("clientOrganizationId", "status");

-- CreateIndex
CREATE INDEX "service_contracts_status_endsOn_idx" ON "service_contracts"("status", "endsOn");

-- CreateIndex
CREATE INDEX "service_contract_assets_assetId_idx" ON "service_contract_assets"("assetId");

-- CreateIndex
CREATE INDEX "service_visits_contractId_status_idx" ON "service_visits"("contractId", "status");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryDistrictId_fkey" FOREIGN KEY ("deliveryDistrictId") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_document_series" ADD CONSTRAINT "tax_document_series_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assets" ADD CONSTRAINT "equipment_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assets" ADD CONSTRAINT "equipment_assets_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contract_assets" ADD CONSTRAINT "service_contract_assets_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contract_assets" ADD CONSTRAINT "service_contract_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "equipment_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "service_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "equipment_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CHECK constraints (not expressible in the Prisma schema)
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_check" CHECK ("priceMinor" >= 0);
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 1000000);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check" CHECK ("subtotalMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" = "subtotalMinor" + "taxMinor");
ALTER TABLE "orders" ADD CONSTRAINT "orders_payments_check" CHECK ("paidMinor" >= 0 AND "refundedMinor" >= 0 AND "refundedMinor" <= "paidMinor" AND "paidMinor" <= "totalMinor");
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_amounts_check" CHECK ("quantity" >= 1 AND "returnedQuantity" BETWEEN 0 AND "quantity" AND "taxRateBasisPoints" >= 0 AND "netMinor" >= 0 AND "taxMinor" >= 0 AND "grossMinor" = "netMinor" + "taxMinor");
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_amounts_check" CHECK ("netMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" = "netMinor" + "taxMinor" AND "sequence" >= 1);
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_kind_check" CHECK (("kind" = 'INVOICE' AND "invoiceKey" = "orderId" AND "returnRequestId" IS NULL) OR ("kind" = 'CREDIT_NOTE' AND "invoiceKey" IS NULL AND "returnRequestId" IS NOT NULL));
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_refund_check" CHECK ("refundMinor" >= 0);
ALTER TABLE "equipment_assets" ADD CONSTRAINT "equipment_assets_warranty_check" CHECK ("warrantyUntil" IS NULL OR "purchasedOn" IS NULL OR "warrantyUntil" >= "purchasedOn");
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_terms_check" CHECK ("endsOn" > "startsOn" AND "visitsIncluded" >= 0 AND "priceMinor" >= 0 AND ("responseHours" IS NULL OR "responseHours" > 0) AND "providerOrganizationId" <> "clientOrganizationId");
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_return_window_check" CHECK ("returnWindowDays" BETWEEN 0 AND 60);

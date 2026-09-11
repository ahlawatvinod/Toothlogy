-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('AUTOCLAVE', 'DENTAL_CHAIR', 'COMPRESSOR', 'SUCTION', 'XRAY_UNIT', 'WATERLINE', 'REFRIGERATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_limits" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,

    CONSTRAINT "device_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_readings" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_alerts" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "message" TEXT NOT NULL,
    "openKey" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "device_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_tokenHash_key" ON "devices"("tokenHash");

-- CreateIndex
CREATE INDEX "devices_organizationId_status_idx" ON "devices"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "device_limits_deviceId_metric_key" ON "device_limits"("deviceId", "metric");

-- CreateIndex
CREATE INDEX "device_readings_deviceId_metric_recordedAt_idx" ON "device_readings"("deviceId", "metric", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "device_alerts_openKey_key" ON "device_alerts"("openKey");

-- CreateIndex
CREATE INDEX "device_alerts_deviceId_openedAt_idx" ON "device_alerts"("deviceId", "openedAt");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_limits" ADD CONSTRAINT "device_limits_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_readings" ADD CONSTRAINT "device_readings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_alerts" ADD CONSTRAINT "device_alerts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity the schema language cannot express.
ALTER TABLE "device_limits" ADD CONSTRAINT "device_limits_has_a_bound" CHECK ("min" IS NOT NULL OR "max" IS NOT NULL);
ALTER TABLE "device_limits" ADD CONSTRAINT "device_limits_in_order" CHECK ("min" IS NULL OR "max" IS NULL OR "min" <= "max");
ALTER TABLE "device_alerts" ADD CONSTRAINT "device_alerts_open_key_while_open" CHECK (("resolvedAt" IS NULL) = ("openKey" IS NOT NULL));
ALTER TABLE "devices" ADD CONSTRAINT "devices_token_hint_length" CHECK (char_length("tokenHint") = 4);

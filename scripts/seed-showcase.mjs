import { PrismaClient, BrokerOnboardingStatus, LoadStatus, ParseState, ReviewDecision, Role, RuleSeverity } from "@prisma/client";

const prisma = new PrismaClient();

function weekIsoFromDate(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addWeeks(date, weeks) {
  return addDays(date, weeks * 7);
}

async function main() {
  const now = new Date();
  const bookingDate = new Date(now);
  bookingDate.setHours(12, 0, 0, 0);
  const pickupDate = new Date(bookingDate);
  const weekIso = weekIsoFromDate(bookingDate);

  await prisma.$transaction(async (tx) => {
    const region = await tx.region.upsert({
      where: { code: "NE" },
      update: { name: "Northeast" },
      create: { code: "NE", name: "Northeast" }
    });

    const user = await tx.user.upsert({
      where: { id: "showcase-user" },
      update: {
        email: "showcase@local.dev",
        name: "Showcase User"
      },
      create: {
        id: "showcase-user",
        email: "showcase@local.dev",
        name: "Showcase User"
      }
    });

    await tx.userRegionRole.upsert({
      where: {
        userId_regionId: {
          userId: user.id,
          regionId: region.id
        }
      },
      update: { role: Role.ADMIN },
      create: {
        userId: user.id,
        regionId: region.id,
        role: Role.ADMIN
      }
    });

    await tx.dropLot.deleteMany({
      where: {
        regionId: region.id,
        id: { in: ["lot-showcase-lsps01", "lot-showcase-harr01", "lot-showcase-batavia", "lot-showcase-adhoc-ltl"] }
      }
    });

    const dropLots = [
      {
        id: "lot-showcase-awle-bh",
        name: "LOCAL AWLE BH",
        code: "AWLE-BH",
        note: "Local backhaul bucket from board template.",
        city: "Leesport",
        state: "PA",
        sortOrder: 1,
        dailyCapacity: 8,
        slipSeat: true,
        dropHookRequired: true
      },
      {
        id: "lot-showcase-awle-ib",
        name: "LOCAL AWLE INBOUND",
        code: "AWLE-IB",
        note: "Inbound regional bucket from board template.",
        city: "Leesport",
        state: "PA",
        sortOrder: 2,
        dailyCapacity: 8,
        slipSeat: false,
        dropHookRequired: false
      },
      {
        id: "lot-showcase-awle-hub",
        name: "LEESPORT, PA (AWLE)",
        code: "AWLE",
        city: "Leesport",
        state: "PA",
        sortOrder: 3,
        dailyCapacity: 8,
        slipSeat: true,
        dropHookRequired: true
      },
      {
        id: "lot-showcase-dshe",
        name: "HERMON, ME (DSHE)",
        code: "DSHE",
        city: "Hermon",
        state: "ME",
        sortOrder: 4,
        dailyCapacity: 2,
        slipSeat: false,
        dropHookRequired: false
      },
      {
        id: "lot-showcase-ayho",
        name: "HOLLAND, MA (AYHO)",
        code: "AYHO",
        city: "Holland",
        state: "MA",
        sortOrder: 5,
        dailyCapacity: 5,
        slipSeat: true,
        dropHookRequired: true
      },
      {
        id: "lot-showcase-gelba",
        name: "BALDWINSVILLE, NY (GELBA)",
        code: "GELBA",
        city: "Baldwinsville",
        state: "NY",
        sortOrder: 6,
        dailyCapacity: 3,
        slipSeat: true,
        dropHookRequired: true
      },
      {
        id: "lot-showcase-anlja",
        name: "JAMESTOWN, NY (ANLJA)",
        code: "ANLJA",
        city: "Jamestown",
        state: "NY",
        sortOrder: 7,
        dailyCapacity: 2,
        slipSeat: false,
        dropHookRequired: true
      },
      {
        id: "lot-showcase-ztwa",
        name: "WARRENDALE, PA (ZTWA)",
        code: "ZTWA",
        city: "Warrendale",
        state: "PA",
        sortOrder: 8,
        dailyCapacity: 3,
        slipSeat: true,
        dropHookRequired: true
      },
      {
        id: "lot-showcase-ltl",
        name: "LTL",
        code: "LTL",
        note: "Retail trucks without a fixed drop lot; typically deadhead to AWLE unless backhaul is sourced.",
        city: "Leesport",
        state: "PA",
        sortOrder: 9,
        dailyCapacity: 2,
        slipSeat: false,
        dropHookRequired: false
      }
    ];

    for (const lot of dropLots) {
      await tx.dropLot.upsert({
        where: { id: lot.id },
        update: {
          regionId: region.id,
          name: lot.name,
          code: lot.code ?? null,
          note: lot.note ?? null,
          city: lot.city,
          state: lot.state,
          sortOrder: lot.sortOrder,
          dailyCapacity: lot.dailyCapacity,
          slipSeat: lot.slipSeat,
          dropHookRequired: lot.dropHookRequired
        },
        create: {
          ...lot,
          regionId: region.id
        }
      });
    }

    await tx.lane.deleteMany({
      where: {
        regionId: region.id,
        originCity: "Batavia",
        destinationCity: "Leesport",
        destinationState: "PA"
      }
    });

    const broker = await tx.broker.upsert({
      where: { id: "broker-showcase-summit" },
      update: {
        regionId: region.id,
        name: "Summit Transport LLC",
        onboardingStatus: BrokerOnboardingStatus.APPROVED
      },
      create: {
        id: "broker-showcase-summit",
        regionId: region.id,
        name: "Summit Transport LLC",
        onboardingStatus: BrokerOnboardingStatus.APPROVED,
        fscDefaultApplies: true
      }
    });

    const lanes = [
      {
        originCity: "Hermon",
        originState: "ME",
        destinationCity: "Leesport",
        destinationState: "PA",
        targetRate: "1700"
      },
      {
        originCity: "Holland",
        originState: "MA",
        destinationCity: "Leesport",
        destinationState: "PA",
        targetRate: "700"
      },
      {
        originCity: "Baldwinsville",
        originState: "NY",
        destinationCity: "Leesport",
        destinationState: "PA",
        targetRate: "1150"
      },
      {
        originCity: "Jamestown",
        originState: "NY",
        destinationCity: "Leesport",
        destinationState: "PA",
        targetRate: "1300"
      },
      {
        originCity: "Warrendale",
        originState: "PA",
        destinationCity: "Leesport",
        destinationState: "PA",
        targetRate: "1350"
      },
      {
        originCity: "LTL (ALL CITIES)",
        originState: "NA",
        destinationCity: "Leesport",
        destinationState: "PA",
        targetRate: "1200"
      }
    ];

    for (const lane of lanes) {
      await tx.lane.upsert({
        where: {
          regionId_originCity_originState_destinationCity_destinationState: {
            regionId: region.id,
            originCity: lane.originCity,
            originState: lane.originState,
            destinationCity: lane.destinationCity,
            destinationState: lane.destinationState
          }
        },
        update: {
          targetRate: lane.targetRate
        },
        create: {
          regionId: region.id,
          originCity: lane.originCity,
          originState: lane.originState,
          destinationCity: lane.destinationCity,
          destinationState: lane.destinationState,
          targetRate: lane.targetRate
        }
      });
    }

    const rateConfirmation = await tx.rateConfirmation.upsert({
      where: { sourceFileHash: "showcase-rc-hash-001" },
      update: {
        parseState: ParseState.EXTRACTED,
        reviewDecision: ReviewDecision.APPROVED
      },
      create: {
        regionId: region.id,
        weekIso,
        sourceFileUrl: "https://example.com/showcase-rc-001.pdf",
        sourceFileHash: "showcase-rc-hash-001",
        parseState: ParseState.EXTRACTED,
        reviewDecision: ReviewDecision.APPROVED,
        parseConfidence: "0.94",
        extractedPayload: { shipperName: "Acme Foods LLC", receiverName: "BigBox DC Northeast" }
      }
    });

    const loads = [
      {
        id: "showcase-load-001",
        status: LoadStatus.PICKED_UP,
        dropLotId: "lot-showcase-awle-bh",
        ref: "3P-104821",
        routeId: "RT-104821",
        shipperName: "Acme Foods LLC",
        pickupCity: "Pittsburgh",
        pickupState: "PA",
        receiverName: "BigBox DC Northeast",
        deliveryCity: "Leesport",
        deliveryState: "PA",
        lineHaulRate: "2400",
        loadedMiles: "520",
        loadedRpm: "4.62",
        floorRpm: "4.50",
        fscAmount: "700",
        rateConfirmationId: rateConfirmation.id
      },
      {
        id: "showcase-load-002",
        status: LoadStatus.DISPATCHED,
        dropLotId: "lot-showcase-awle-bh",
        ref: "3P-104823",
        routeId: "RT-104823",
        shipperName: "Acme Foods LLC",
        pickupCity: "Pittsburgh",
        pickupState: "PA",
        receiverName: "BigBox DC Northeast",
        deliveryCity: "Leesport",
        deliveryState: "PA",
        lineHaulRate: "1750",
        loadedMiles: "400",
        loadedRpm: "4.20",
        floorRpm: "4.55",
        fscAmount: "520"
      },
      {
        id: "showcase-load-003",
        status: LoadStatus.BOOKED,
        dropLotId: "lot-showcase-awle-bh",
        ref: "3P-104824",
        routeId: "RT-104824",
        shipperName: "SteelCo Industries",
        pickupCity: "Allentown",
        pickupState: "PA",
        receiverName: "Port Newark CY",
        deliveryCity: "Newark",
        deliveryState: "NJ",
        lineHaulRate: "3100",
        loadedMiles: "180",
        loadedRpm: "4.05",
        floorRpm: "4.60",
        fscAmount: "410"
      },
      {
        id: "showcase-load-004",
        status: LoadStatus.BOOKED,
        dropLotId: "lot-showcase-awle-ib",
        ref: "3P-104822",
        routeId: "RT-104822",
        shipperName: "FreshCold Logistics",
        pickupCity: "Harrisburg",
        pickupState: "PA",
        receiverName: "Regional Grocery Co",
        deliveryCity: "Reading",
        deliveryState: "PA",
        lineHaulRate: "980",
        loadedMiles: "210",
        loadedRpm: "4.67",
        floorRpm: "4.40",
        fscAmount: "280"
      },
      {
        id: "showcase-load-005",
        status: LoadStatus.CANCELED,
        dropLotId: null,
        ref: "3P-104777",
        routeId: "RT-104777",
        shipperName: "Acme Foods LLC",
        pickupCity: "Pittsburgh",
        pickupState: "PA",
        receiverName: "BigBox DC Northeast",
        deliveryCity: "Leesport",
        deliveryState: "PA",
        lineHaulRate: "150",
        loadedMiles: "0",
        loadedRpm: "0",
        floorRpm: "4.50",
        fscAmount: "0"
      },
      {
        id: "showcase-load-006",
        status: LoadStatus.BOOKED,
        dropLotId: "lot-showcase-ltl",
        driverType: "LTL",
        ref: "3P-104900",
        routeId: "RT-104900",
        shipperName: "PaperSource Mills",
        pickupCity: "Scranton",
        pickupState: "PA",
        receiverName: "Walmart DC 6092",
        deliveryCity: "Pottsville",
        deliveryState: "PA",
        lineHaulRate: "1220",
        loadedMiles: "95",
        loadedRpm: "12.84",
        floorRpm: "4.30",
        fscAmount: "120"
      }
    ];

    for (const load of loads) {
      const totalTripMiles = Number(load.loadedMiles) + 28 + 35;
      const emptyMilePct = totalTripMiles === 0 ? "0.0000" : ((28 + 35) / totalTripMiles).toFixed(4);
      await tx.load.upsert({
        where: { id: load.id },
        update: {
          regionId: region.id,
          weekIso,
          pickupDate,
          bookingDate,
          status: load.status,
          createdById: user.id,
          dropLotId: load.dropLotId,
          rateConfirmationId: load.rateConfirmationId ?? null,
          brokerId: broker.id,
          routeId: load.routeId,
          loadNumber: load.ref,
          pickupNumber: `PU-${load.ref}`,
          threePlRefNumber: load.ref,
          mgStatus: "CLEARED",
          tmwStatus: "ASSIGNED",
          pickupDriverAssigned: "J. Morales",
          tractorTrailer1: "TRK-8821",
          tractorTrailer2: "TRL-2291",
          commodity: "General",
          equipmentNeeds: "53' dry van",
          shipperName: load.shipperName,
          pickupCity: load.pickupCity,
          pickupState: load.pickupState,
          pickupWindow: "08:00–12:00",
          receiverName: load.receiverName,
          deliveryCity: load.deliveryCity,
          deliveryState: load.deliveryState,
          deliveryWindow: "14:00–18:00",
          podStatus: load.status === LoadStatus.DELIVERED ? "UPLOADED" : "REQUESTED",
          driverType: load.driverType ?? null,
          lineHaulRate: load.lineHaulRate,
          loadedMiles: load.loadedMiles,
          puDeadheadMiles: "28",
          delDeadheadMiles: "35",
          fscApplies: true,
          fscRateUsed: "0.52",
          fscAmount: load.fscAmount,
          totalTripMiles: String(totalTripMiles),
          negotiableMiles: load.loadedMiles,
          loadedRpm: load.loadedRpm,
          negotiationFloorRpm: load.floorRpm,
          emptyMilePct
        },
        create: {
          id: load.id,
          regionId: region.id,
          weekIso,
          pickupDate,
          bookingDate,
          status: load.status,
          createdById: user.id,
          dropLotId: load.dropLotId,
          rateConfirmationId: load.rateConfirmationId ?? null,
          brokerId: broker.id,
          routeId: load.routeId,
          loadNumber: load.ref,
          pickupNumber: `PU-${load.ref}`,
          threePlRefNumber: load.ref,
          mgStatus: "CLEARED",
          tmwStatus: "ASSIGNED",
          pickupDriverAssigned: "J. Morales",
          tractorTrailer1: "TRK-8821",
          tractorTrailer2: "TRL-2291",
          commodity: "General",
          equipmentNeeds: "53' dry van",
          shipperName: load.shipperName,
          pickupCity: load.pickupCity,
          pickupState: load.pickupState,
          pickupWindow: "08:00–12:00",
          receiverName: load.receiverName,
          deliveryCity: load.deliveryCity,
          deliveryState: load.deliveryState,
          deliveryWindow: "14:00–18:00",
          podStatus: load.status === LoadStatus.DELIVERED ? "UPLOADED" : "REQUESTED",
          driverType: load.driverType ?? null,
          lineHaulRate: load.lineHaulRate,
          loadedMiles: load.loadedMiles,
          puDeadheadMiles: "28",
          delDeadheadMiles: "35",
          fscApplies: true,
          fscRateUsed: "0.52",
          fscAmount: load.fscAmount,
          totalTripMiles: String(totalTripMiles),
          negotiableMiles: load.loadedMiles,
          loadedRpm: load.loadedRpm,
          negotiationFloorRpm: load.floorRpm,
          emptyMilePct
        }
      });
    }

    const snapshotSeeds = [
      { week: weekIsoFromDate(addWeeks(bookingDate, 0)), loads: 47, rev: "58420", empty: "0.0580", floor: "4.52" },
      { week: weekIsoFromDate(addWeeks(bookingDate, -1)), loads: 41, rev: "54240", empty: "0.0670", floor: "4.48" },
      { week: weekIsoFromDate(addWeeks(bookingDate, -2)), loads: 39, rev: "51080", empty: "0.0710", floor: "4.44" },
      { week: weekIsoFromDate(addWeeks(bookingDate, -3)), loads: 36, rev: "48200", empty: "0.0740", floor: "4.41" }
    ];

    for (const snap of snapshotSeeds) {
      await tx.weekSnapshot.upsert({
        where: {
          regionId_weekIso: {
            regionId: region.id,
            weekIso: snap.week
          }
        },
        update: {
          loadCount: snap.loads,
          lineHaulRevenue: snap.rev,
          totalLoadedMiles: "12800",
          totalPickupDeadhead: "670",
          totalDeliveryDeadhead: "630",
          totalEmptyMiles: "1300",
          totalTripMiles: "14100",
          emptyMilePct: snap.empty,
          negFloorRpm: snap.floor
        },
        create: {
          regionId: region.id,
          weekIso: snap.week,
          loadCount: snap.loads,
          lineHaulRevenue: snap.rev,
          fuelSurchargeAmount: "7400",
          totalLoadedMiles: "12800",
          totalPickupDeadhead: "670",
          totalDeliveryDeadhead: "630",
          totalEmptyMiles: "1300",
          totalTripMiles: "14100",
          emptyMilePct: snap.empty,
          negFloorRpm: snap.floor
        }
      });
    }

    const rules = [
      {
        code: "FRONT_DROP_HOOK",
        severity: RuleSeverity.ACTION_REQUIRED,
        statement: "3PL must guarantee drop-hook at pickup."
      },
      {
        code: "BUFFER_0900",
        severity: RuleSeverity.WARN,
        statement: "PU windows before 09:00 risk HOS conflict."
      }
    ];

    for (const rule of rules) {
      await tx.operationalRule.upsert({
        where: {
          regionId_code: {
            regionId: region.id,
            code: rule.code
          }
        },
        update: {
          severity: rule.severity,
          statement: rule.statement
        },
        create: {
          regionId: region.id,
          code: rule.code,
          severity: rule.severity,
          statement: rule.statement
        }
      });
    }
  });

  console.log("Showcase seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

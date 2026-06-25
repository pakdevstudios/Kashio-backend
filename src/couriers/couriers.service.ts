import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourierStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourierDto } from './dto/create-courier.dto';
import { CourierQueryDto } from './dto/courier-query.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';

// Allowed forward transitions for the courier lifecycle.
const TRANSITIONS: Record<CourierStatus, CourierStatus[]> = {
  PENDING: [CourierStatus.ASSIGNED, CourierStatus.CANCELLED],
  ASSIGNED: [
    CourierStatus.ACCEPTED,
    CourierStatus.PENDING, // un-assign / rider declined
    CourierStatus.CANCELLED,
  ],
  ACCEPTED: [CourierStatus.PICKED_UP, CourierStatus.CANCELLED],
  PICKED_UP: [CourierStatus.ON_THE_WAY, CourierStatus.CANCELLED],
  ON_THE_WAY: [CourierStatus.DELIVERED, CourierStatus.CANCELLED],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class CouriersService {
  constructor(private prisma: PrismaService) {}

  // --- Create a booking ---------------------------------------------------
  async create(dto: CreateCourierDto, customerId?: string) {
    const code = await this.generateCode();
    return this.prisma.courier.create({
      data: {
        code,
        categories: dto.categories,
        weight: dto.weight,
        notes: dto.notes,
        price: dto.price ?? 0,
        pickupName: dto.pickupName,
        pickupContact: dto.pickupContact,
        pickupAddress: dto.pickupAddress,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        dropName: dto.dropName,
        dropContact: dto.dropContact,
        dropAddress: dto.dropAddress,
        dropLat: dto.dropLat,
        dropLng: dto.dropLng,
        customerId: customerId ?? null,
        status: CourierStatus.PENDING,
        events: {
          create: { status: CourierStatus.PENDING, note: 'Booking created' },
        },
      },
      include: this.fullInclude(),
    });
  }

  // --- Listing (admin) ----------------------------------------------------
  async findAll(query: CourierQueryDto) {
    const where: Prisma.CourierWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.riderId) where.riderId = query.riderId;
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { pickupName: { contains: query.search, mode: 'insensitive' } },
        { dropName: { contains: query.search, mode: 'insensitive' } },
        { dropAddress: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.courier.findMany({
      where,
      include: this.fullInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { id },
      include: this.fullInclude(),
    });
    if (!courier) throw new NotFoundException('Courier not found');
    return courier;
  }

  // --- Listing (customer's own bookings) ---------------------------------
  async findForCustomer(customerId: string) {
    return this.prisma.courier.findMany({
      where: { customerId },
      include: this.fullInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Open pool: unassigned jobs riders can claim -----------------------
  async availableForRiders() {
    return this.prisma.courier.findMany({
      where: { status: CourierStatus.PENDING, riderId: null },
      include: this.fullInclude(),
      orderBy: { createdAt: 'asc' },
    });
  }

  // --- Open pool: a rider self-claims a pending job ----------------------
  // PENDING -> ACCEPTED in one guarded step. The updateMany acts as an atomic
  // compare-and-set so two riders can't grab the same job (whoever lands the
  // write first wins; the loser gets a 409).
  async claimByRider(id: string, user: AuthUser) {
    if (!user.riderId) {
      throw new ForbiddenException('Only riders can claim jobs');
    }
    const now = new Date();
    const { count } = await this.prisma.courier.updateMany({
      where: { id, status: CourierStatus.PENDING, riderId: null },
      data: {
        riderId: user.riderId,
        status: CourierStatus.ACCEPTED,
        assignedAt: now,
        acceptedAt: now,
      },
    });
    if (count === 0) {
      // Either it doesn't exist or another rider already claimed it.
      const exists = await this.prisma.courier.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('Courier not found');
      throw new ConflictException('Job already taken');
    }
    await this.prisma.courierEvent.createMany({
      data: [
        {
          courierId: id,
          status: CourierStatus.ASSIGNED,
          note: 'Claimed by rider',
        },
        {
          courierId: id,
          status: CourierStatus.ACCEPTED,
          note: 'Rider accepted',
        },
      ],
    });
    return this.findOne(id);
  }

  // --- Tracking timeline --------------------------------------------------
  async track(id: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { id },
      include: {
        rider: { include: { user: { select: { name: true, phone: true } } } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!courier) throw new NotFoundException('Courier not found');
    return {
      id: courier.id,
      code: courier.code,
      status: courier.status,
      rider: courier.rider
        ? {
            id: courier.rider.id,
            name: courier.rider.user.name,
            phone: courier.rider.user.phone,
            vehicle: courier.rider.vehicle,
          }
        : null,
      pickup: {
        name: courier.pickupName,
        address: courier.pickupAddress,
        lat: courier.pickupLat,
        lng: courier.pickupLng,
      },
      drop: {
        name: courier.dropName,
        address: courier.dropAddress,
        lat: courier.dropLat,
        lng: courier.dropLng,
      },
      timeline: courier.events.map((e) => ({
        status: e.status,
        note: e.note,
        at: e.createdAt,
      })),
    };
  }

  // --- Admin assigns a rider ---------------------------------------------
  async assignRider(id: string, riderId: string) {
    const courier = await this.findOne(id);
    this.assertTransition(courier.status, CourierStatus.ASSIGNED);

    const rider = await this.prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new NotFoundException('Rider not found');

    return this.applyStatus(
      id,
      CourierStatus.ASSIGNED,
      `Assigned to rider ${riderId}`,
      { riderId, assignedAt: new Date() },
    );
  }

  // --- Rider accepts the assignment --------------------------------------
  async acceptByRider(id: string, user: AuthUser) {
    const courier = await this.findOne(id);
    if (!user.riderId) {
      throw new ForbiddenException('Only riders can accept jobs');
    }
    if (courier.riderId !== user.riderId) {
      throw new ForbiddenException('This job is not assigned to you');
    }
    this.assertTransition(courier.status, CourierStatus.ACCEPTED);
    return this.applyStatus(id, CourierStatus.ACCEPTED, 'Rider accepted', {
      acceptedAt: new Date(),
    });
  }

  // --- Rider declines -> back to the pool --------------------------------
  async declineByRider(id: string, user: AuthUser) {
    const courier = await this.findOne(id);
    if (courier.riderId !== user.riderId) {
      throw new ForbiddenException('This job is not assigned to you');
    }
    if (courier.status !== CourierStatus.ASSIGNED) {
      throw new BadRequestException('Job can no longer be declined');
    }
    return this.applyStatus(id, CourierStatus.PENDING, 'Rider declined', {
      riderId: null,
      assignedAt: null,
    });
  }

  // --- Generic status update (admin or assigned rider) -------------------
  async updateStatus(
    id: string,
    status: CourierStatus,
    note: string | undefined,
    user: AuthUser,
  ) {
    const courier = await this.findOne(id);

    // A rider may only move their own job, and not assign/cancel via this route.
    if (user.role === Role.RIDER) {
      if (courier.riderId !== user.riderId) {
        throw new ForbiddenException('This job is not assigned to you');
      }
      const riderAllowed: CourierStatus[] = [
        CourierStatus.ACCEPTED,
        CourierStatus.PICKED_UP,
        CourierStatus.ON_THE_WAY,
        CourierStatus.DELIVERED,
      ];
      if (!riderAllowed.includes(status)) {
        throw new ForbiddenException('Riders cannot set this status');
      }
    }

    this.assertTransition(courier.status, status);

    const extra: Prisma.CourierUncheckedUpdateInput = {};
    if (status === CourierStatus.PICKED_UP) extra.pickedUpAt = new Date();
    if (status === CourierStatus.DELIVERED) extra.deliveredAt = new Date();

    return this.applyStatus(id, status, note, extra);
  }

  // --- Cancel -------------------------------------------------------------
  // Admins cancel any booking; customers may only cancel their own.
  async cancel(id: string, reason: string | undefined, user?: AuthUser) {
    const courier = await this.findOne(id);
    if (user?.role === Role.CUSTOMER && courier.customerId !== user.id) {
      throw new ForbiddenException('You can only cancel your own booking');
    }
    this.assertTransition(courier.status, CourierStatus.CANCELLED);
    return this.applyStatus(
      id,
      CourierStatus.CANCELLED,
      reason ?? 'Cancelled',
      { cancelledAt: new Date(), cancelReason: reason ?? null },
    );
  }

  // --- helpers ------------------------------------------------------------
  private async applyStatus(
    id: string,
    status: CourierStatus,
    note: string | undefined,
    extra: Prisma.CourierUncheckedUpdateInput = {},
  ) {
    return this.prisma.courier.update({
      where: { id },
      data: {
        status,
        ...extra,
        events: { create: { status, note } },
      },
      include: this.fullInclude(),
    });
  }

  private assertTransition(from: CourierStatus, to: CourierStatus) {
    if (from === to) return;
    if (!TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(
        `Cannot change status from ${from} to ${to}`,
      );
    }
  }

  private fullInclude() {
    return {
      rider: {
        include: {
          user: { select: { name: true, phone: true, email: true } },
        },
      },
      customer: { select: { id: true, name: true, phone: true } },
    } satisfies Prisma.CourierInclude;
  }

  // DLV-1042 style sequential-ish code.
  private async generateCode() {
    const count = await this.prisma.courier.count();
    return `DLV-${1000 + count + 1}`;
  }
}

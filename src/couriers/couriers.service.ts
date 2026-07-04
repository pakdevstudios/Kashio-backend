import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, CourierStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourierDto } from './dto/create-courier.dto';
import {
  AdminOrderAddressDto,
  AdminOrderItemDto,
  CreateAdminOrderDto,
} from './dto/create-admin-order.dto';
import { CourierQueryDto } from './dto/courier-query.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { AddressesService } from '../addresses/addresses.service';

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
  constructor(
    private prisma: PrismaService,
    private addressesService: AddressesService,
  ) {}

  // --- Create a booking ---------------------------------------------------
  async create(dto: CreateCourierDto, customerId?: string) {
    const code = await this.generateCode();
    const pickup = await this.resolveCourierAddress('pickup', dto, customerId);
    const drop = await this.resolveCourierAddress('drop', dto, customerId);

    return this.prisma.courier.create({
      data: {
        code,
        categories: dto.categories,
        weight: dto.weight,
        notes: dto.notes,
        price: dto.price ?? 0,
        pickupName: pickup.name,
        pickupContact: pickup.contact,
        pickupAddress: pickup.address,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        dropName: drop.name,
        dropContact: drop.contact,
        dropAddress: drop.address,
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

  async lookupCustomerByContact(contact: string) {
    const clean = contact.trim();
    if (!clean) throw new BadRequestException('Contact is required');

    const customer = await this.prisma.user.findFirst({
      where: {
        role: Role.CUSTOMER,
        OR: [{ phone: clean }, { email: clean.toLowerCase() }],
      },
      include: {
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!customer) return { exists: false, customer: null, address: null };

    const address = customer.addresses[0] ?? null;
    return {
      exists: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      address: address
        ? {
            id: address.id,
            fullName: address.fullName,
            phone: address.phone,
            addressLine: address.addressLine,
            city: address.city,
            stateProvince: address.stateProvince,
            country: address.country,
            postalCode: address.postalCode,
            deliveryInstructions: address.deliveryInstructions,
            isDefault: address.isDefault,
          }
        : null,
    };
  }

  async createAdminOrder(dto: CreateAdminOrderDto) {
    const code = await this.generateCode();
    const items = await this.buildOrderItems(dto.items);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const categories = Array.from(
      new Set(items.map((item) => item.categoryName).filter(Boolean)),
    ) as string[];

    const courier = await this.prisma.$transaction(async (tx) => {
      const customer = await this.findOrCreateAdminCustomer(tx, dto);
      const address = await this.upsertAdminAddress(tx, customer.id, dto.address);
      const dropAddress = this.formatAddressInput(address);

      return tx.courier.create({
        data: {
          code,
          categories: categories.length ? categories : ['Products'],
          notes: dto.notes?.trim() || null,
          price: total,
          pickupName: dto.pickupName?.trim() || 'Kashio Dispatch',
          pickupContact: dto.pickupContact?.trim() || 'N/A',
          pickupAddress: dto.pickupAddress?.trim() || 'Kashio Store',
          dropName: address.fullName,
          dropContact: address.phone,
          dropAddress,
          customerId: customer.id,
          status: CourierStatus.PENDING,
          events: {
            create: { status: CourierStatus.PENDING, note: 'Admin order created' },
          },
          orderItems: {
            create: items.map((item) => ({
              productId: item.productId,
              variationOptionId: item.variationOptionId,
              productName: item.productName,
              selectedVariant: item.selectedVariant,
              price: item.price,
              quantity: item.quantity,
            })),
          },
        },
        include: this.fullInclude(),
      });
    });

    return courier;
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
      orderItems: true,
    } satisfies Prisma.CourierInclude;
  }

  private async resolveCourierAddress(
    type: 'pickup' | 'drop',
    dto: CreateCourierDto,
    customerId?: string,
  ) {
    const addressId =
      type === 'pickup' ? dto.pickupAddressId : dto.dropAddressId;

    if (addressId) {
      if (!customerId) {
        throw new BadRequestException(
          'Saved addresses can only be used by customer accounts',
        );
      }

      const address = await this.addressesService.findOwnedAddress(
        customerId,
        addressId,
      );

      return {
        name: address.fullName,
        contact: address.phone,
        address: this.addressesService.formatForCourier(address),
      };
    }

    const name = type === 'pickup' ? dto.pickupName : dto.dropName;
    const contact = type === 'pickup' ? dto.pickupContact : dto.dropContact;
    const address = type === 'pickup' ? dto.pickupAddress : dto.dropAddress;

    if (!name || !contact || !address) {
      throw new BadRequestException(
        `${type} address details are required when no saved address is selected`,
      );
    }

    return { name, contact, address };
  }

  // DLV-1042 style sequential-ish code.
  private async generateCode() {
    const count = await this.prisma.courier.count();
    return `DLV-${1000 + count + 1}`;
  }

  private async findOrCreateAdminCustomer(
    tx: Prisma.TransactionClient,
    dto: CreateAdminOrderDto,
  ) {
    if (dto.customer.id) {
      const existing = await tx.user.findUnique({ where: { id: dto.customer.id } });
      if (!existing) throw new NotFoundException('Customer not found');
      return existing;
    }

    const contact = dto.customer.contact.trim();
    const email = dto.customer.email?.trim().toLowerCase();
    const existing = await tx.user.findFirst({
      where: {
        role: Role.CUSTOMER,
        OR: [
          { phone: contact },
          ...(email ? [{ email }] : []),
          { email: this.generatedCustomerEmail(contact) },
        ],
      },
    });
    if (existing) return existing;

    return tx.user.create({
      data: {
        name: dto.customer.name.trim(),
        phone: contact,
        email: email || this.generatedCustomerEmail(contact),
        role: Role.CUSTOMER,
        provider: AuthProvider.PASSWORD,
      },
    });
  }

  private async upsertAdminAddress(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: AdminOrderAddressDto,
  ) {
    const data = {
      fullName: dto.fullName.trim(),
      phone: dto.phone.trim(),
      addressLine: dto.addressLine.trim(),
      city: dto.city.trim(),
      stateProvince: dto.stateProvince.trim(),
      country: dto.country.trim(),
      postalCode: dto.postalCode.trim(),
      deliveryInstructions: dto.deliveryInstructions?.trim() || null,
      isDefault: true,
    };

    await tx.address.updateMany({
      where: { userId, isDefault: true, ...(dto.id ? { NOT: { id: dto.id } } : {}) },
      data: { isDefault: false },
    });

    if (dto.id) {
      const existing = await tx.address.findUnique({ where: { id: dto.id } });
      if (!existing) throw new NotFoundException('Address not found');
      if (existing.userId !== userId) {
        throw new ForbiddenException('Cannot access another customer address');
      }
      return tx.address.update({ where: { id: dto.id }, data });
    }

    return tx.address.create({ data: { userId, ...data } });
  }

  private async buildOrderItems(dtoItems: AdminOrderItemDto[]) {
    const ids = Array.from(new Set(dtoItems.map((item) => item.productId)));
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { category: true, variationOptions: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    return dtoItems.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new NotFoundException('One or more products were not found');

      const variant = item.variationOptionId
        ? product.variationOptions.find(
            (option) => option.id === item.variationOptionId,
          )
        : product.variationOptions.find((option) => option.isDefault) ??
          product.variationOptions[0];

      if (item.variationOptionId && !variant) {
        throw new BadRequestException('Selected variant does not belong to product');
      }

      return {
        productId: product.id,
        variationOptionId: variant?.id ?? null,
        productName: product.title,
        selectedVariant: variant?.name ?? null,
        categoryName: product.category.name,
        price:
          item.price ??
          (variant
            ? variant.salePrice ?? variant.price
            : product.discountedPrice ?? product.price),
        quantity: item.quantity,
      };
    });
  }

  private formatAddressInput(address: {
    addressLine: string;
    city: string;
    stateProvince: string;
    postalCode: string;
    country: string;
  }) {
    return [
      address.addressLine,
      address.city,
      address.stateProvince,
      address.postalCode,
      address.country,
    ]
      .filter(Boolean)
      .join(', ');
  }

  private generatedCustomerEmail(contact: string) {
    const clean = contact.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'customer';
    return `${clean}@customer.kashio.local`;
  }
}

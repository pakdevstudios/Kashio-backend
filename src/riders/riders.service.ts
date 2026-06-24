import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourierStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRiderDto } from './dto/create-rider.dto';

const ACTIVE_STATUSES: CourierStatus[] = [
  CourierStatus.ASSIGNED,
  CourierStatus.ACCEPTED,
  CourierStatus.PICKED_UP,
  CourierStatus.ON_THE_WAY,
];

@Injectable()
export class RidersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateRiderDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hash,
        name: dto.name,
        phone: dto.phone,
        role: Role.RIDER,
        rider: {
          create: {
            location: dto.location,
            vehicle: dto.vehicle ?? 'Bike',
          },
        },
      },
      include: { rider: true },
    });

    return this.toRiderView(user.rider!.id);
  }

  // Admin listing of all riders, including a live active-ride count.
  async findAll() {
    const riders = await this.prisma.rider.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        _count: {
          select: { couriers: { where: { status: { in: ACTIVE_STATUSES } } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return riders.map((r) => ({
      id: r.id,
      name: r.user.name,
      email: r.user.email,
      phone: r.user.phone,
      location: r.location,
      vehicle: r.vehicle,
      isAvailable: r.isAvailable,
      activeRides: r._count.couriers,
    }));
  }

  async toRiderView(riderId: string) {
    const r = await this.prisma.rider.findUnique({
      where: { id: riderId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        _count: {
          select: { couriers: { where: { status: { in: ACTIVE_STATUSES } } } },
        },
      },
    });
    if (!r) throw new NotFoundException('Rider not found');
    return {
      id: r.id,
      name: r.user.name,
      email: r.user.email,
      phone: r.user.phone,
      location: r.location,
      vehicle: r.vehicle,
      isAvailable: r.isAvailable,
      activeRides: r._count.couriers,
    };
  }

  // Past / historical orders for a rider (delivered or cancelled).
  async pastCouriers(riderId: string) {
    await this.assertRiderExists(riderId);
    return this.prisma.courier.findMany({
      where: {
        riderId,
        status: { in: [CourierStatus.DELIVERED, CourierStatus.CANCELLED] },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // Current/active jobs assigned to a rider.
  async activeCouriers(riderId: string) {
    await this.assertRiderExists(riderId);
    return this.prisma.courier.findMany({
      where: { riderId, status: { in: ACTIVE_STATUSES } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async assertRiderExists(riderId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
    });
    if (!rider) throw new NotFoundException('Rider not found');
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return addresses.map((address) => this.toAddressView(address));
  }

  async create(userId: string, dto: CreateAddressDto) {
    const existingCount = await this.prisma.address.count({ where: { userId } });
    const shouldBeDefault = existingCount === 0 || dto.isDefault === true;

    const address = await this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          userId,
          ...this.cleanCreateAddressInput(dto),
          isDefault: shouldBeDefault,
        },
      });
    });

    return this.toAddressView(address);
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this.findOwnedAddress(userId, id);
    const shouldBeDefault = dto.isDefault === true;

    const address = await this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id },
        data: {
          ...this.cleanUpdateAddressInput(dto),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
    });

    if (!address.isDefault) {
      await this.ensureDefaultAddress(userId);
      return this.findOwnedAddress(userId, id);
    }

    return this.toAddressView(address);
  }

  async setDefault(userId: string, id: string) {
    await this.findOwnedAddress(userId, id);

    const address = await this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });

      return tx.address.update({
        where: { id },
        data: { isDefault: true },
      });
    });

    return this.toAddressView(address);
  }

  async remove(userId: string, id: string) {
    const address = await this.findOwnedAddress(userId, id);

    await this.prisma.address.delete({ where: { id } });

    if (address.isDefault) {
      await this.ensureDefaultAddress(userId);
    }

    return { success: true };
  }

  async findOwnedAddress(userId: string, id: string) {
    const address = await this.prisma.address.findUnique({ where: { id } });
    if (!address) throw new NotFoundException('Address not found');
    if (address.userId !== userId) {
      throw new ForbiddenException('Cannot access another customer address');
    }
    return this.toAddressView(address);
  }

  formatForCourier(address: ReturnType<AddressesService['toAddressView']>) {
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

  private async ensureDefaultAddress(userId: string) {
    const hasDefault = await this.prisma.address.findFirst({
      where: { userId, isDefault: true },
      select: { id: true },
    });
    if (hasDefault) return;

    const next = await this.prisma.address.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!next) return;

    await this.prisma.address.update({
      where: { id: next.id },
      data: { isDefault: true },
    });
  }

  private cleanCreateAddressInput(
    dto: CreateAddressDto,
  ): Omit<
    Prisma.AddressUncheckedCreateInput,
    'id' | 'userId' | 'isDefault' | 'createdAt' | 'updatedAt'
  > {
    return {
      fullName: this.cleanRequired(dto.fullName),
      phone: this.cleanRequired(dto.phone),
      addressLine: this.cleanRequired(dto.addressLine),
      city: this.cleanRequired(dto.city),
      stateProvince: this.cleanRequired(dto.stateProvince),
      country: this.cleanRequired(dto.country),
      postalCode: this.cleanRequired(dto.postalCode),
      deliveryInstructions: this.cleanOptional(dto.deliveryInstructions),
    };
  }

  private cleanUpdateAddressInput(
    dto: UpdateAddressDto,
  ): Prisma.AddressUncheckedUpdateInput {
    const data: Prisma.AddressUncheckedUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = this.cleanRequired(dto.fullName);
    if (dto.phone !== undefined) data.phone = this.cleanRequired(dto.phone);
    if (dto.addressLine !== undefined) {
      data.addressLine = this.cleanRequired(dto.addressLine);
    }
    if (dto.city !== undefined) data.city = this.cleanRequired(dto.city);
    if (dto.stateProvince !== undefined) {
      data.stateProvince = this.cleanRequired(dto.stateProvince);
    }
    if (dto.country !== undefined) data.country = this.cleanRequired(dto.country);
    if (dto.postalCode !== undefined) {
      data.postalCode = this.cleanRequired(dto.postalCode);
    }
    if (dto.deliveryInstructions !== undefined) {
      data.deliveryInstructions = this.cleanOptional(dto.deliveryInstructions);
    }
    return data;
  }

  private cleanRequired(value: string) {
    return value.trim();
  }

  private cleanOptional(value?: string) {
    const clean = value?.trim();
    return clean ? clean : null;
  }

  private toAddressView(address: Address) {
    return {
      id: address.id,
      userId: address.userId,
      fullName: address.fullName,
      phone: address.phone,
      addressLine: address.addressLine,
      city: address.city,
      stateProvince: address.stateProvince,
      country: address.country,
      postalCode: address.postalCode,
      deliveryInstructions: address.deliveryInstructions,
      isDefault: address.isDefault,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RidersService } from './riders.service';
import { CreateRiderDto } from './dto/create-rider.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller('riders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RidersController {
  constructor(private readonly ridersService: RidersService) {}

  // --- Admin ---

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateRiderDto) {
    return this.ridersService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.ridersService.findAll();
  }

  // --- Rider self-service (must come before :id routes) ---

  // GET /v1/riders/me/couriers — past (history) orders for the logged-in rider
  @Get('me/couriers')
  @Roles(Role.RIDER)
  myPastCouriers(@CurrentUser() user: AuthUser) {
    if (!user.riderId)
      throw new BadRequestException('Account has no rider profile');
    return this.ridersService.pastCouriers(user.riderId);
  }

  // GET /v1/riders/me/active — current jobs for the logged-in rider
  @Get('me/active')
  @Roles(Role.RIDER)
  myActiveCouriers(@CurrentUser() user: AuthUser) {
    if (!user.riderId)
      throw new BadRequestException('Account has no rider profile');
    return this.ridersService.activeCouriers(user.riderId);
  }

  // --- Admin: inspect a specific rider ---

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id') id: string) {
    return this.ridersService.toRiderView(id);
  }

  // GET /v1/riders/:id/couriers — past orders for a given rider (admin view)
  @Get(':id/couriers')
  @Roles(Role.ADMIN)
  riderPastCouriers(@Param('id') id: string) {
    return this.ridersService.pastCouriers(id);
  }
}

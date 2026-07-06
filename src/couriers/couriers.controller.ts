import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CouriersService } from './couriers.service';
import {
  AdminOrderItemDto,
  CreateAdminOrderDto,
} from './dto/create-admin-order.dto';
import {
  CheckoutDraftDto,
  CreateDraftOrderDto,
  UpdateDraftItemDto,
} from './dto/draft-order.dto';
import { CreateCourierDto } from './dto/create-courier.dto';
import { CourierQueryDto } from './dto/courier-query.dto';
import { AssignRiderDto } from './dto/assign-rider.dto';
import {
  CancelCourierDto,
  UpdateStatusDto,
} from './dto/update-status.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';

@Controller('couriers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  // POST /v1/couriers — book a courier (customer from the app, or admin)
  @Post()
  @Roles(Role.ADMIN, Role.CUSTOMER)
  create(@Body() dto: CreateCourierDto, @CurrentUser() user: AuthUser) {
    const customerId = user.role === Role.CUSTOMER ? user.id : undefined;
    return this.couriersService.create(dto, customerId);
  }

  // GET /v1/couriers — admin list with ?status= &riderId= &search=
  @Get()
  @Roles(Role.ADMIN)
  findAll(@Query() query: CourierQueryDto) {
    return this.couriersService.findAll(query);
  }

  @Get('customers/lookup')
  @Roles(Role.ADMIN)
  lookupCustomer(@Query('contact') contact: string) {
    return this.couriersService.lookupCustomerByContact(contact ?? '');
  }

  @Post('admin-orders')
  @Roles(Role.ADMIN)
  createAdminOrder(@Body() dto: CreateAdminOrderDto) {
    return this.couriersService.createAdminOrder(dto);
  }

  // POST /v1/couriers/admin-orders/draft — open/resume a draft cart for a caller
  @Post('admin-orders/draft')
  @Roles(Role.ADMIN)
  createDraft(@Body() dto: CreateDraftOrderDto) {
    return this.couriersService.createDraftOrder(dto);
  }

  // GET /v1/couriers/mine — the logged-in customer's own bookings
  @Get('mine')
  @Roles(Role.CUSTOMER)
  findMine(@CurrentUser() user: AuthUser) {
    return this.couriersService.findForCustomer(user.id);
  }

  // GET /v1/couriers/available — open pool of unassigned jobs for riders
  // (literal route must precede the :id route below)
  @Get('available')
  @Roles(Role.RIDER)
  available() {
    return this.couriersService.availableForRiders();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RIDER)
  findOne(@Param('id') id: string) {
    return this.couriersService.findOne(id);
  }

  // POST /v1/couriers/:id/claim — rider self-claims a pending job
  @Post(':id/claim')
  @Roles(Role.RIDER)
  claim(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.couriersService.claimByRider(id, user);
  }

  // GET /v1/couriers/:id/track — tracking timeline
  @Get(':id/track')
  @Roles(Role.ADMIN, Role.RIDER, Role.CUSTOMER)
  track(@Param('id') id: string) {
    return this.couriersService.track(id);
  }

  // POST /v1/couriers/:id/assign — admin assigns a rider
  @Post(':id/assign')
  @Roles(Role.ADMIN)
  assign(@Param('id') id: string, @Body() dto: AssignRiderDto) {
    return this.couriersService.assignRider(id, dto.riderId);
  }

  // POST /v1/couriers/:id/accept — rider accepts the assignment
  @Post(':id/accept')
  @Roles(Role.RIDER)
  accept(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.couriersService.acceptByRider(id, user);
  }

  // POST /v1/couriers/:id/decline — rider declines -> back to pending
  @Post(':id/decline')
  @Roles(Role.RIDER)
  decline(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.couriersService.declineByRider(id, user);
  }

  // PATCH /v1/couriers/:id/status — advance status (admin or assigned rider)
  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.RIDER)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.couriersService.updateStatus(id, dto.status, dto.note, user);
  }

  // POST /v1/couriers/:id/cancel — admin cancels any booking; customer cancels own
  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.CUSTOMER)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelCourierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.couriersService.cancel(id, dto.reason, user);
  }

  // --- Draft cart management (admin) ---------------------------------------
  // POST /v1/couriers/:id/items — add a product line to a draft
  @Post(':id/items')
  @Roles(Role.ADMIN)
  addItem(@Param('id') id: string, @Body() dto: AdminOrderItemDto) {
    return this.couriersService.addDraftItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  @Roles(Role.ADMIN)
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateDraftItemDto,
  ) {
    return this.couriersService.updateDraftItem(id, itemId, dto.quantity);
  }

  @Delete(':id/items/:itemId')
  @Roles(Role.ADMIN)
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.couriersService.removeDraftItem(id, itemId);
  }

  // POST /v1/couriers/:id/checkout — finalize a draft -> PENDING (delivery pipeline)
  @Post(':id/checkout')
  @Roles(Role.ADMIN)
  checkout(@Param('id') id: string, @Body() dto: CheckoutDraftDto) {
    return this.couriersService.checkoutDraft(id, dto);
  }
}

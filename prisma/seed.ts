import { PrismaClient, Role, CourierStatus, ParcelWeight } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADDR = 'H89, St21, District Courts, Kashmir';

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@kashio.app').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  // --- Admin ---
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: adminHash,
      name: 'Kashio Admin',
      role: Role.ADMIN,
    },
  });
  console.log(`Admin ready: ${admin.email} / ${adminPassword}`);

  // --- Riders (default password "rider123") ---
  const riderHash = await bcrypt.hash('rider123', 10);
  const riderSeed = [
    { name: 'Arshid Farooq', email: 'arshid@kashio.app', location: 'Kotli, Kashmir' },
    { name: 'Usman Tariq', email: 'usman@kashio.app', location: 'Kotli, Kashmir' },
    { name: 'Bilal Yousuf', email: 'bilal@kashio.app', location: 'Kotli, Kashmir' },
    { name: 'Fahad Iqbal', email: 'fahad@kashio.app', location: 'Kotli, Kashmir' },
  ];

  const riders: Record<string, string> = {}; // name -> riderId
  for (const r of riderSeed) {
    const user = await prisma.user.upsert({
      where: { email: r.email },
      update: {},
      create: {
        email: r.email,
        password: riderHash,
        name: r.name,
        phone: '+923327475849',
        role: Role.RIDER,
        rider: { create: { location: r.location, vehicle: 'Bike' } },
      },
      include: { rider: true },
    });
    riders[r.name] = user.rider!.id;
  }
  console.log(`Seeded ${riderSeed.length} riders (password: rider123)`);

  // --- Categories ---
  const categorySeed = [
    { name: 'Documents', slug: 'documents' },
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Food', slug: 'food' },
    { name: 'Clothes', slug: 'clothes' },
  ];
  for (const category of categorySeed) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }
  console.log(`Seeded ${categorySeed.length} categories`);

  // --- Sample couriers (only when table is empty) ---
  const existing = await prisma.courier.count();
  if (existing === 0) {
    const samples = [
      {
        code: 'DLV-1001',
        status: CourierStatus.PENDING,
        customer: 'Ahmed Hamid',
        price: 200,
        rider: null as string | null,
        categories: ['Documents'],
      },
      {
        code: 'DLV-1002',
        status: CourierStatus.ON_THE_WAY,
        customer: 'Noman Asif',
        price: 2400,
        rider: 'Bilal Yousuf',
        categories: ['Electronics'],
      },
      {
        code: 'DLV-1003',
        status: CourierStatus.DELIVERED,
        customer: 'Ali Paracha',
        price: 320,
        rider: 'Usman Tariq',
        categories: ['Food'],
      },
      {
        code: 'DLV-1004',
        status: CourierStatus.DELIVERED,
        customer: 'Imran Khan',
        price: 950,
        rider: 'Arshid Farooq',
        categories: ['Clothes'],
      },
    ];

    for (const s of samples) {
      const riderId = s.rider ? riders[s.rider] : null;
      await prisma.courier.create({
        data: {
          code: s.code,
          status: s.status,
          categories: s.categories,
          weight: ParcelWeight.UPTO_5KG,
          price: s.price,
          pickupName: 'Kashio Store',
          pickupContact: '+923327475849',
          pickupAddress: ADDR,
          dropName: s.customer,
          dropContact: '+923327475849',
          dropAddress: ADDR,
          riderId,
          assignedAt: riderId ? new Date() : null,
          acceptedAt: riderId ? new Date() : null,
          deliveredAt:
            s.status === CourierStatus.DELIVERED ? new Date() : null,
          events: {
            create: { status: s.status, note: 'Seed data' },
          },
        },
      });
    }
    console.log(`Seeded ${samples.length} sample couriers`);
  } else {
    console.log('Couriers already present — skipping sample couriers');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

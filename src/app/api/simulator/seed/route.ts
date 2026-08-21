import { NextResponse } from 'next/server';
import { seedDatabase } from '@/lib/db/seed';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const count = await seedDatabase();
    return NextResponse.json({
      success: true,
      data: {
        count,
        message: `Successfully seeded ${count} failures and customers.`,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while seeding the database.';
    console.error('[POST /api/simulator/seed]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SEED_ERROR',
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}

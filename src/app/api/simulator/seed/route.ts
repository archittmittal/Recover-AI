import { NextResponse } from 'next/server';
import { seedDatabase } from '@/lib/db/seed';
import { resetDemoClock } from '@/lib/utils/demo-clock';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const count = await seedDatabase();

    // Reseeding is the only way back to real time (RA-31). The demo clock refuses to move
    // backwards on its own because rewinding past a fired attempt would let the same outreach
    // replay; a reseed deletes those rows first, so there is nothing left to replay.
    resetDemoClock();
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

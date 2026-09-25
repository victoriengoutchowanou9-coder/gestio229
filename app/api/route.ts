import { z } from 'zod';
import { NextResponse } from 'next/server';

const schemaDonnees = z.object({
  montant: z.number().positive(),
  description: z.string().min(3),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const donneesValidees = schemaDonnees.parse(body); // Rejette automatiquement si invalide
    return NextResponse.json({ success: true, data: donneesValidees });
  } catch (error) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
}

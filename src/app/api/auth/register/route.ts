import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";
import { z } from "zod";

// Normalize username: trim (and optionally lowercase — uncomment .toLowerCase() if you want CI usernames)
const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be at most 50 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, _ and -")
    .transform(s => s.trim() /*.toLowerCase()*/),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
});

export async function POST(request: NextRequest) {
  try {
    console.log("➡️  /api/auth/register called");
    const body = await request.json().catch(() => ({}));
    console.log("BODY:", body);

    const { username, password } = registerSchema.parse(body);

    const result = await registerUser(username, password);
    console.log("✅ Registered user:", result.userId, result.username);

    return NextResponse.json(
      {
        success: true,
        userId: result.userId,
        username: result.username,
        message: "Account created successfully",
      },
      { status: 201 }
    );
  } catch (error: any) {
    // 1) Zod validation
    if (error instanceof z.ZodError) {
      const { fieldErrors, formErrors } = error.flatten();
      console.warn("❗ Zod validation failed:", fieldErrors, formErrors);
      return NextResponse.json(
        { error: "Validation failed", fieldErrors, formErrors },
        { status: 400 }
      );
    }

    // 2) Our explicit guard in registerUser
    if (error instanceof Error && error.message === "Username already exists") {
      console.warn("❗ Duplicate username (guard):", error.message);
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }

    // 3) Mongo duplicate key (unique index)
    if (error?.code === 11000 || /E11000 duplicate key/i.test(String(error?.message))) {
      console.warn("❗ Duplicate username (E11000):", error?.message);
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }

    // 4) Everything else → log it fully so you can see why 500
    console.error("💥 POST /api/auth/register error:", error);
    return NextResponse.json(
      {
        error: "Registration failed",
        // DEV ONLY: include message to see why (comment out in prod)
        message: process.env.NODE_ENV !== "production" ? String(error?.message ?? error) : undefined,
      },
      { status: 500 }
    );
  }
}

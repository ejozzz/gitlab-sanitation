import { NextRequest, NextResponse } from 'next/server';
import { settingsFormSchema } from '@/lib/config.shared';
import { GitLabAPIClient } from '@/lib/gitlab';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = settingsFormSchema.parse(body);

    const client = new GitLabAPIClient(
      validated.gitlabHost,
      validated.gitlabToken,
      validated.projectId
    );

    const { user, project } = await client.validateToken();

    return NextResponse.json({
      valid: true,
      user: {
        name: user.name,
        username: user.username,
      },
      project: {
        name: project.name,
        path_with_namespace: project.path_with_namespace,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Validation failed' },
      { status: 400 }
    );
  }
}
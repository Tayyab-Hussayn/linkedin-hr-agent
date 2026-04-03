import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'linkedin_agent',
  user: 'hragent',
  password: 'hragent123',
})

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.client_id,
        p.content,
        p.topic_pillar,
        p.post_format,
        p.approval_status,
        p.post_status,
        p.approval_note,
        p.estimated_words,
        p.created_at,
        p.approved_at,
        p.published_at,
        p.scheduled_for,
        c.name as client_name
      FROM posts p
      JOIN clients c ON c.id = p.client_id
      WHERE
        p.approval_status = 'approved'
        AND p.post_status = 'draft'
        AND p.scheduled_for IS NOT NULL
      ORDER BY p.scheduled_for ASC
      LIMIT 50
    `)

    return NextResponse.json(result.rows)
  } catch (error) {
    console.error('Error fetching scheduled posts:', error)
    return NextResponse.json([], { status: 500 })
  }
}

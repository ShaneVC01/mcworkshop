/**
 * customers-list: the most recently created active customers from NetSuite.
 *
 * GET  /functions/v1/customers-list?limit=25
 * POST /functions/v1/customers-list   { "limit": 25 }
 * Header: x-api-key
 *
 * Read only. Returns our own customer shape, never NetSuite field names.
 */
import { readParams, withApiKey } from '../_shared/http/api-key.ts'
import { EdgeError } from '../_shared/http/response.ts'
import { runSuiteQL } from '../_shared/netsuite/suiteql.ts'

interface CustomerRow {
  id: string
  entityid?: string
  isperson?: string | boolean
  companyname?: string
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  mobilephone?: string
  datecreated?: string
}

export interface Customer {
  id: string
  number: string
  name: string
  kind: 'person' | 'company'
  email?: string
  phone?: string
  mobile?: string
  createdAt?: string
}

const QUERY = `
  SELECT id, entityid, isperson, companyname, firstname, lastname, email, phone, mobilephone, datecreated
  FROM customer
  WHERE isinactive = 'F'
  ORDER BY datecreated DESC
`

/** SuiteQL returns checkboxes as 'T' or 'F', but be tolerant of other spellings. */
function isTrue(value: unknown) {
  return value === true || (typeof value === 'string' && ['t', 'true', 'y', 'yes', '1'].includes(value.trim().toLowerCase()))
}

function toCustomer(row: CustomerRow): Customer {
  const person = isTrue(row.isperson)
  const personName = [row.firstname, row.lastname].filter(Boolean).join(' ').trim()
  return {
    id: String(row.id),
    number: row.entityid ?? String(row.id),
    name: (person ? personName : row.companyname) || row.companyname || personName || row.entityid || `Customer ${row.id}`,
    kind: person ? 'person' : 'company',
    email: row.email || undefined,
    phone: row.phone || undefined,
    mobile: row.mobilephone || undefined,
    createdAt: row.datecreated || undefined,
  }
}

Deno.serve(
  withApiKey({ name: 'customers-list', methods: ['GET', 'POST'] }, async (ctx) => {
    const params = await readParams(ctx.req)
    const limit = params.limit === undefined ? 25 : Number(params.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new EdgeError('bad_request', 400, 'limit must be a whole number from 1 to 100.')
    }
    const page = await runSuiteQL<CustomerRow>(ctx, QUERY, { limit })
    return {
      data: page.items.map(toCustomer),
      // NetSuite caps totalResults relative to the page size, so it is not a reliable total. Only hasMore is.
      meta: { count: page.count, hasMore: page.hasMore },
    }
  }),
)

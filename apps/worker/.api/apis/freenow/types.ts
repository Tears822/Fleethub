import type { FromSchema } from 'json-schema-to-ts';
import * as schemas from './schemas';

export type GetCompanyBookingsMetadataParam = FromSchema<typeof schemas.GetCompanyBookings.metadata>;
export type GetCompanyBookingsResponse200 = FromSchema<typeof schemas.GetCompanyBookings.response['200']>;
export type GetCompanyDriversPaginatedMetadataParam = FromSchema<typeof schemas.GetCompanyDriversPaginated.metadata>;
export type GetCompanyDriversPaginatedResponse200 = FromSchema<typeof schemas.GetCompanyDriversPaginated.response['200']>;
export type GetCompanyEarningsMetadataParam = FromSchema<typeof schemas.GetCompanyEarnings.metadata>;
export type GetCompanyEarningsResponse200 = FromSchema<typeof schemas.GetCompanyEarnings.response['200']>;
export type GetDriverEarningsMetadataParam = FromSchema<typeof schemas.GetDriverEarnings.metadata>;
export type GetDriverEarningsResponse200 = FromSchema<typeof schemas.GetDriverEarnings.response['200']>;
export type GetLinkedCompaniesMetadataParam = FromSchema<typeof schemas.GetLinkedCompanies.metadata>;
export type GetLinkedCompaniesResponse200 = FromSchema<typeof schemas.GetLinkedCompanies.response['200']>;

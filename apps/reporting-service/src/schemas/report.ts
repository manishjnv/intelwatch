import { z } from 'zod';

export const ReportTypeEnum = z.enum(['daily', 'weekly', 'monthly', 'custom', 'executive']);
export type ReportType = z.infer<typeof ReportTypeEnum>;

export const ReportFormatEnum = z.enum(['json', 'html', 'pdf', 'csv']);
export type ReportFormat = z.infer<typeof ReportFormatEnum>;

export const ReportStatusEnum = z.enum(['pending', 'generating', 'completed', 'failed']);
export type ReportStatus = z.infer<typeof ReportStatusEnum>;

export const CreateReportSchema = z.object({
  type: ReportTypeEnum,
  format: ReportFormatEnum.default('json'),
  title: z.string().min(1).max(200).optional(),
  tenantId: z.string().min(1).default('default'),
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).optional(),
  filters: z.object({
    severities: z.array(z.enum(['critical', 'high', 'medium', 'low', 'info'])).optional(),
    iocTypes: z.array(z.string()).optional(),
    feedIds: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  configVersion: z.number().int().min(1).default(1),
});

export type CreateReportDto = z.infer<typeof CreateReportSchema>;

export const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(200),
  reportType: ReportTypeEnum,
  format: ReportFormatEnum.default('json'),
  cronExpression: z.string().min(1),
  tenantId: z.string().min(1).default('default'),
  enabled: z.boolean().default(true),
  filters: z.object({
    severities: z.array(z.enum(['critical', 'high', 'medium', 'low', 'info'])).optional(),
    iocTypes: z.array(z.string()).optional(),
    feedIds: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  configVersion: z.number().int().min(1).default(1),
});

export type CreateScheduleDto = z.infer<typeof CreateScheduleSchema>;

export const UpdateScheduleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  reportType: ReportTypeEnum.optional(),
  format: ReportFormatEnum.optional(),
  cronExpression: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  filters: z.object({
    severities: z.array(z.enum(['critical', 'high', 'medium', 'low', 'info'])).optional(),
    iocTypes: z.array(z.string()).optional(),
    feedIds: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  configVersion: z.number().int().min(1).optional(),
});

export type UpdateScheduleDto = z.infer<typeof UpdateScheduleSchema>;

export const ListReportsQuerySchema = z.object({
  tenantId: z.string().min(1).default('default'),
  type: ReportTypeEnum.optional(),
  status: ReportStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListReportsQuery = z.infer<typeof ListReportsQuerySchema>;

export const BulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

export type BulkDeleteDto = z.infer<typeof BulkDeleteSchema>;

export const BulkToggleSchedulesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  enabled: z.boolean(),
});

export type BulkToggleSchedulesDto = z.infer<typeof BulkToggleSchedulesSchema>;

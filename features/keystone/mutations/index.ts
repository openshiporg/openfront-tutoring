import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import * as schedule from "./schedule";
import * as assessments from "./assessments";
import * as billing from "./billing";
import * as memberships from "./memberships";
import * as families from "./families";
import * as tutors from "./tutors";
import * as storefrontQueries from "../queries/storefront";

const graphql = String.raw;

/**
 * §5.9 commands whose names match a Keystone generated create/update. The generated
 * operation is omitted on the list (`graphql.omit`), but the sudo schema keeps it, so the
 * command replaces it there. Any other clash is a bug and still throws.
 */
const COMMAND_OVERRIDES = new Set(['createSessionSeries', 'createPayrollRun', 'createTutorApplication', 'updateStudent']);

// Each module exports { typeDefs, resolvers }. Storefront read queries live in ../queries.
const modules = [storefrontQueries, schedule, assessments, billing, memberships, families, tutors];

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: [
      graphql`
        type Query {
          redirectToInit: Boolean
        }
      `,
      ...modules.map((m) => m.typeDefs),
    ],
    ...({ onFieldTypeConflict: (existing: any, incoming: any, type: any) => {
      if (type?.name?.value === 'Mutation' && COMMAND_OVERRIDES.has(incoming?.name?.value)) return incoming;
      throw new Error(`GraphQL field clash: ${type?.name?.value}.${incoming?.name?.value}`);
    } } as object),
    resolvers: [
      { Query: { redirectToInit } },
      ...modules.map((m) => m.resolvers as any),
    ],
  });
}

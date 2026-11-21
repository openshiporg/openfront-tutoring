import { relationship, timestamp } from "@keystone-6/core/fields";

export const trackingFields = {
  createdAt: timestamp({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" },
    },
  }),
  updatedAt: timestamp({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: 'hidden' },
      itemView: { fieldMode: 'read' },
    },
  }),
  // Set from the session on create; server commands set it explicitly.
  createdBy: relationship({
    ref: "User",
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } },
    hooks: {
      resolveInput: ({ operation, context, resolvedData }) => {
        if (operation === "create" && context.session?.itemId) return { connect: { id: context.session.itemId } };
        return resolvedData.createdBy;
      },
    },
  }),
};

import type { z } from "zod";
import type { BlockDefinition } from "@clipai/engine";

type Input<S extends z.ZodType> = Omit<BlockDefinition<z.output<S>>, "schema" | "defaults"> & {
  schema: S;
  /** Example props; schema defaults fill the rest. */
  defaults?: z.input<S>;
};

/** Define a block. `defaults` is completed by parsing it through the schema. */
export function defineBlock<S extends z.ZodType>(def: Input<S>): BlockDefinition<z.output<S>> {
  return { ...def, defaults: def.schema.parse(def.defaults ?? {}) } as BlockDefinition<z.output<S>>;
}

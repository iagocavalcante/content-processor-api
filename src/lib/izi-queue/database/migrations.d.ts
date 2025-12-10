export interface Migration {
    version: number;
    name: string;
    up: string;
    down?: string;
}
export declare const postgresMigrations: Migration[];
export declare const sqliteMigrations: Migration[];
export declare const mysqlMigrations: Migration[];
//# sourceMappingURL=migrations.d.ts.map
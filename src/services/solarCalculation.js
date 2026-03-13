/**
 * Solar Energy Calculation Service
 * Calculates Performance Ratio (PR) and Capacity Utilization Factor (CUF)
 *
 * Formulas:
 *   PR  = (Yf / Yr) × 100
 *         Yf = Eac / Pdc   (Final Yield)
 *         Yr = GHI / 1     (Reference Yield)
 *
 *   CUF = ActualEnergy / (TotalHours × PlantCapacity) × 100
 */

class SolarCalculation {
    /**
     * Calculate solar irradiance components (POA breakdown)
     * @param {number} ghi - Global Horizontal Irradiance (kWh/m²)
     * @param {number} tiltAngle - Module tilt angle in degrees (default: 18°)
     * @param {number} diffuseFraction - Diffuse fraction fd (default: 0.2)
     * @param {number} albedo - Ground reflectance ρ (default: 0.2)
     * @returns {object} Irradiance components { diffuse, reflected, beam, totalPOA }
     */
    static calculateIrradianceComponents(ghi, tiltAngle = 18, diffuseFraction = 0.2, albedo = 0.2) {
        if (!ghi || ghi <= 0) {
            return { diffuse: 0, reflected: 0, beam: 0, totalPOA: 0 };
        }

        const beta = (tiltAngle * Math.PI) / 180; // Convert to radians

        // Diffuse Component: Id = GHI × fd × (1 + cos β) / 2
        const Id = ghi * diffuseFraction * (1 + Math.cos(beta)) / 2;

        // Reflected Component: Ir = GHI × ρ × (1 - cos β) / 2
        const Ir = ghi * albedo * (1 - Math.cos(beta)) / 2;

        // Beam Component: Ib = GHI - (Id + Ir)
        const Ib = ghi - (Id + Ir);

        // Total Plane of Array (POA) Irradiance
        const totalPOA = Ib + Id + Ir;

        return {
            diffuse: Number(Id.toFixed(9)),
            reflected: Number(Ir.toFixed(9)),
            beam: Number(Ib.toFixed(4)),
            totalPOA: Number(totalPOA.toFixed(4))
        };
    }

    /**
     * Calculate Performance Ratio (PR)
     * PR = (Yf / Yr) × 100
     *
     * @param {number} acEnergy - AC Energy Export Eac (kWh)
     * @param {number} dcCapacity - Installed DC Capacity Pdc (kWp)
     * @param {number} ghi - Global Horizontal Irradiance (kWh/m²)
     * @returns {object} { referenceYield, finalYield, performanceRatio, unit }
     */
    static calculatePerformanceRatio(acEnergy, dcCapacity, ghi) {
        if (!dcCapacity || dcCapacity <= 0) {
            throw new Error('DC Capacity (Pdc) is required and must be > 0');
        }
        if (!ghi || ghi <= 0) {
            return {
                referenceYield: 0,
                finalYield: 0,
                performanceRatio: 0,
                unit: '%'
            };
        }

        // Reference Yield (Yr) = GHI / 1 kW/m²
        const referenceYield = ghi / 1;

        // Final Yield (Yf) = Eac / Pdc
        const finalYield = acEnergy / dcCapacity;

        // Performance Ratio (PR) = (Yf / Yr) × 100
        const performanceRatio = (finalYield / referenceYield) * 100;

        return {
            referenceYield: Number(referenceYield.toFixed(4)),
            finalYield: Number(finalYield.toFixed(9)),
            performanceRatio: Number(performanceRatio.toFixed(7)),
            unit: '%'
        };
    }

    /**
     * Calculate Capacity Utilization Factor (CUF)
     * Standard Formula: CUF = ActualEnergy / (TotalHours × PlantCapacity) × 100
     *
     * @param {number} totalEnergy - Actual energy generated (kWh)
     * @param {number} plantCapacity - Plant capacity (kWp)
     * @param {number} days - Number of days in period
     * @returns {object} CUF calculation result
     */
    static calculateCUF(totalEnergy, plantCapacity, days) {
        if (!plantCapacity || plantCapacity <= 0) {
            throw new Error('Plant Capacity is required and must be > 0');
        }
        if (!days || days <= 0) {
            throw new Error('Days must be > 0');
        }

        const hourAvailable = 24 * days;

        // CUF = ActualEnergy / (TotalHours × PlantCapacity) × 100
        const cuf = (totalEnergy / (hourAvailable * plantCapacity)) * 100;

        return {
            totalEnergy: Number(totalEnergy.toFixed(2)),
            plantCapacity: Number(plantCapacity.toFixed(3)),
            daysAnalyzed: days,
            hourAvailable: hourAvailable,
            cuf: Number(cuf.toFixed(2)),
            unit: '%'
        };
    }

    /**
     * Extract AC Energy value from dataList
     * Searches for daily production or AC energy parameters
     * @param {array} dataList - Array of device data parameters
     * @returns {number} AC Energy in kWh
     */
    static extractACEnergy(dataList) {
        if (!Array.isArray(dataList) || dataList.length === 0) {
            return 0;
        }

        const acEnergyItem = dataList.find(item =>
            item.name && (
                item.name.toLowerCase().includes('energy') ||
                item.name.toLowerCase().includes('eac') ||
                item.name.toLowerCase().includes('production') ||
                item.key.toLowerCase().includes('etdy') ||
                item.key.toLowerCase().includes('eac')
            )
        );

        return acEnergyItem ? parseFloat(acEnergyItem.value) || 0 : 0;
    }

    /**
     * Extract daily production (Etdy_ge1) from dataList
     * @param {array} dataList - Array of device data parameters
     * @returns {number} Daily production in kWh
     */
    static extractDailyProduction(dataList) {
        if (!Array.isArray(dataList) || dataList.length === 0) return 0;

        const item = dataList.find(d =>
            d.key?.toLowerCase() === 'etdy_ge1' ||
            d.key?.toLowerCase().includes('etdy')
        );
        return item ? parseFloat(item.value) || 0 : 0;
    }

    /**
     * Extract cumulative total energy (Et_ge0) from dataList
     * @param {array} dataList - Array of device data parameters
     * @returns {number} Cumulative energy in kWh
     */
    static extractCumulativeEnergy(dataList) {
        if (!Array.isArray(dataList) || dataList.length === 0) return 0;

        const item = dataList.find(d =>
            d.key?.toLowerCase() === 'et_ge0' ||
            d.key?.toLowerCase().includes('et_ge')
        );
        return item ? parseFloat(item.value) || 0 : 0;
    }

    /**
     * Complete daily calculation (PR + CUF + Irradiance)
     * @param {object} params - Calculation parameters
     * @returns {object} Complete calculation result
     */
    static calculateDaily(params) {
        const {
            acEnergy = 0,
            dcCapacity = 0,
            ghi = 0,
            totalEnergy = 0,
            days = 1,
            tiltAngle = 18,
            diffuseFraction = 0.2,
            albedo = 0.2
        } = params;

        try {
            // 1. Calculate irradiance components
            const irradiance = this.calculateIrradianceComponents(ghi, tiltAngle, diffuseFraction, albedo);

            // 2. Calculate PR using daily AC energy (Eac) and GHI
            const pr = this.calculatePerformanceRatio(acEnergy, dcCapacity, ghi);

            // 3. Calculate CUF using total energy over the period
            const energyForCUF = totalEnergy > 0 ? totalEnergy : acEnergy;
            const cuf = this.calculateCUF(energyForCUF, dcCapacity, days);

            return {
                success: true,
                data: {
                    irradiance,
                    performance: pr,
                    utilization: cuf,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = SolarCalculation;

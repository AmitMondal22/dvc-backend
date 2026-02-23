/**
 * Solar Energy Calculation Service
 * Calculates Performance Ratio (PR) and Capacity Utilization Factor (CUF)
 */

class SolarCalculation {
    /**
     * Calculate solar irradiance components
     * @param {number} ghi - Global Horizontal Irradiance (kWh/m²)
     * @param {number} tiltAngle - Module tilt angle in degrees (default: 18°)
     * @param {number} diffuseFraction - Diffuse fraction (default: 0.2)
     * @param {number} albedo - Ground reflectance (default: 0.2)
     * @returns {object} Irradiance components
     */
    static calculateIrradianceComponents(ghi, tiltAngle = 18, diffuseFraction = 0.2, albedo = 0.2) {
        const beta = (tiltAngle * Math.PI) / 180; // Convert to radians

        // Diffuse Component
        const Id = ghi * diffuseFraction * (1 + Math.cos(beta)) / 2;

        // Reflected Component
        const Ir = ghi * albedo * (1 - Math.cos(beta)) / 2;

        // Beam Component
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
     * @param {number} acEnergy - AC Energy Export in kWh
     * @param {number} dcCapacity - Installed DC Capacity in kWp
     * @param {number} ghi - Global Horizontal Irradiance in kWh/m²
     * @returns {object} Performance metrics
     */
    static calculatePerformanceRatio(acEnergy, dcCapacity, ghi) {
        if (!dcCapacity || dcCapacity === 0) {
            throw new Error('DC Capacity is required and cannot be zero');
        }

        // Reference Yield (Yr) = POA / 1 kW/m² (simplified, using GHI)
        const referenceYield = ghi / 1;

        // Final Yield (Yf) = Eac / Pdc
        const finalYield = acEnergy / dcCapacity;

        // Performance Ratio (PR) = Yf / Yr × 100
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
     * CUF = (Total Energy Generated / (Plant Capacity × Hours Available)) × 100
     * @param {number} totalEnergy - Total energy generated in kWh
     * @param {number} plantCapacity - Plant capacity in kWp
     * @param {number} days - Number of days
     * @param {number} degradationFactor - Annual degradation factor (default: 0.07 for year 2)
     * @param {number} year - System year for degradation (default: 2)
     * @returns {object} CUF calculation
     */
    static calculateCUF(totalEnergy, plantCapacity, days, degradationFactor = 0.07, year = 2) {
        if (!plantCapacity || plantCapacity === 0) {
            throw new Error('Plant Capacity is required and cannot be zero');
        }

        const hourAvailable = 24 * days;
        const cuf = (totalEnergy / (plantCapacity * hourAvailable)) * 100;

        return {
            totalEnergy: Number(totalEnergy.toFixed(2)),
            plantCapacity: Number(plantCapacity.toFixed(3)),
            daysAnalyzed: days,
            hourAvailable: hourAvailable,
            degradationFactor: degradationFactor,
            year: year,
            cuf: Number(cuf.toFixed(2)),
            unit: '%'
        };
    }

    /**
     * Extract AC Energy value from dataList
     * @param {array} dataList - Array of device data parameters
     * @returns {number} AC Energy in kWh
     */
    static extractACEnergy(dataList) {
        if (!Array.isArray(dataList) || dataList.length === 0) {
            return 0;
        }

        // Look for common AC energy labels
        const acEnergyItem = dataList.find(item =>
            item.name && (
                item.name.toLowerCase().includes('energy') ||
                item.name.toLowerCase().includes('eac') ||
                item.name.toLowerCase().includes('production') ||
                item.key.toLowerCase().includes('etdy') || // Daily production
                item.key.toLowerCase().includes('eac')
            )
        );

        return acEnergyItem ? parseFloat(acEnergyItem.value) || 0 : 0;
    }

    /**
     * Complete daily calculation
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
            albedo = 0.2,
            degradationFactor = 0.07,
            year = 2
        } = params;

        try {
            // Calculate irradiance components
            const irradiance = this.calculateIrradianceComponents(ghi, tiltAngle, diffuseFraction, albedo);

            // Calculate PR using daily AC energy and GHI
            const pr = this.calculatePerformanceRatio(acEnergy, dcCapacity, ghi);

            // Calculate CUF using total energy over the period
            const energyForCUF = totalEnergy > 0 ? totalEnergy : acEnergy;
            const cuf = this.calculateCUF(energyForCUF, dcCapacity, days, degradationFactor, year);

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
